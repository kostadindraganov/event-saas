import "server-only";
import { and, asc, count, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { listing, listingImage, message, thread, user } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { getBaseUrl } from "@/lib/seo";
import { newMessageEmail, sendEmail } from "@/lib/email";
import type { MessageDTO, ThreadDetailDTO, ThreadListItemDTO } from "./messaging.dto";

type ThreadRow = typeof thread.$inferSelect;
type MessageRow = typeof message.$inferSelect;

export class MessagingDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser) {
    return new MessagingDAL(user);
  }

  // guard: user.id ∈ {customerId, vendorId}; иначе NOT_FOUND (не издавай съществуване)
  private async participantThread(threadId: string): Promise<ThreadRow> {
    const [row] = await db.select().from(thread).where(eq(thread.id, threadId));
    if (!row || (row.customerId !== this.user.id && row.vendorId !== this.user.id)) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return row;
  }

  // fire-and-forget: чете email от user; НИКОГА не бута мутацията
  private async notifyNewMessage(threadId: string, listingId: string, recipientId: string, body: string): Promise<void> {
    const [r] = await db
      .select({ email: user.email, name: user.name, title: listing.title })
      .from(user)
      .innerJoin(listing, eq(listing.id, listingId))
      .where(eq(user.id, recipientId));
    if (!r?.email) return;
    const { subject, html } = newMessageEmail({
      recipientName: r.name,
      listingTitle: r.title,
      body,
      threadUrl: `${getBaseUrl()}/profil/saobshtenia/${threadId}`,
    });
    await sendEmail({ to: r.email, subject, html });
  }

  private toMessageDTO(m: MessageRow): MessageDTO {
    return {
      id: m.id,
      mine: m.senderId === this.user.id,
      body: m.body,
      eventDate: m.eventDate, // drizzle date() → string | null
      phone: m.phone,
      createdAt: m.createdAt,
      readAt: m.readAt,
    };
  }

  async createInquiry(input: {
    listingId: string; body: string; eventDate?: string; phone?: string;
  }): Promise<{ threadId: string }> {
    const [l] = await db
      .select({ ownerId: listing.ownerId, status: listing.status })
      .from(listing)
      .where(eq(listing.id, input.listingId));
    if (!l || l.status !== "published") throw new TRPCError({ code: "NOT_FOUND" });
    if (l.ownerId === this.user.id) throw new TRPCError({ code: "FORBIDDEN" });

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: thread.id })
        .from(thread)
        .where(and(eq(thread.listingId, input.listingId), eq(thread.customerId, this.user.id)));
      const now = new Date();
      if (existing) {
        // съществуващ thread → само append (eventDate/phone се игнорират при append)
        await tx.insert(message).values({ threadId: existing.id, senderId: this.user.id, body: input.body });
        await tx.update(thread).set({ lastMessageAt: now }).where(eq(thread.id, existing.id));
        return { threadId: existing.id };
      }
      const [created] = await tx
        .insert(thread)
        .values({ listingId: input.listingId, customerId: this.user.id, vendorId: l.ownerId, lastMessageAt: now })
        .onConflictDoNothing({ target: [thread.listingId, thread.customerId] })
        .returning({ id: thread.id });
      if (created) {
        await tx.insert(message).values({
          threadId: created.id,
          senderId: this.user.id,
          body: input.body,
          eventDate: input.eventDate ?? null,
          phone: input.phone ?? null,
        });
        return { threadId: created.id };
      }
      // race: конкурентен insert вече спечели → съществуващият thread е там, третираме като append
      const [won] = await tx
        .select({ id: thread.id })
        .from(thread)
        .where(and(eq(thread.listingId, input.listingId), eq(thread.customerId, this.user.id)));
      if (!won) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await tx.insert(message).values({ threadId: won.id, senderId: this.user.id, body: input.body });
      await tx.update(thread).set({ lastMessageAt: now }).where(eq(thread.id, won.id));
      return { threadId: won.id };
    });
    // ново запитване → email до вендора (recipient = listing.ownerId); важи за всички пътища по-горе (нов thread или append)
    void this.notifyNewMessage(result.threadId, input.listingId, l.ownerId, input.body)
      .catch((e) => console.error("email failed", e));
    return result;
  }

  async listThreads(): Promise<ThreadListItemDTO[]> {
    const me = this.user.id;
    const customerUser = alias(user, "cu");
    const vendorUser = alias(user, "vu");
    const rows = await db
      .select({
        id: thread.id,
        listingId: thread.listingId,
        listingTitle: listing.title,
        listingSlug: listing.slug,
        coverImageId: listingImage.cfImageId,
        vendorId: thread.vendorId,
        customerName: customerUser.name,
        vendorName: vendorUser.name,
        lastMessageAt: thread.lastMessageAt,
        lastMessageBody: sql<string | null>`(select m.body from ${message} m where m.thread_id = ${thread.id} order by m.created_at desc limit 1)`,
        unreadCount: sql<number>`(select count(*)::int from ${message} m where m.thread_id = ${thread.id} and m.sender_id <> ${me} and m.read_at is null)`,
      })
      .from(thread)
      .innerJoin(listing, eq(thread.listingId, listing.id))
      .innerJoin(customerUser, eq(thread.customerId, customerUser.id))
      .innerJoin(vendorUser, eq(thread.vendorId, vendorUser.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .where(or(eq(thread.customerId, me), eq(thread.vendorId, me)))
      .orderBy(desc(thread.lastMessageAt));
    return rows.map((r) => {
      const role = r.vendorId === me ? ("vendor" as const) : ("customer" as const);
      return {
        id: r.id,
        listingId: r.listingId,
        listingTitle: r.listingTitle,
        listingSlug: r.listingSlug,
        coverImageId: r.coverImageId,
        role,
        counterpartName: role === "vendor" ? r.customerName : r.vendorName,
        lastMessageAt: r.lastMessageAt,
        lastMessageBody: r.lastMessageBody ?? "",
        unreadCount: r.unreadCount,
      };
    });
  }

  async getThread(threadId: string): Promise<ThreadDetailDTO> {
    const row = await this.participantThread(threadId);
    const customerUser = alias(user, "cu");
    const vendorUser = alias(user, "vu");
    const [meta] = await db
      .select({
        listingTitle: listing.title,
        listingSlug: listing.slug,
        customerName: customerUser.name,
        vendorName: vendorUser.name,
      })
      .from(thread)
      .innerJoin(listing, eq(thread.listingId, listing.id))
      .innerJoin(customerUser, eq(thread.customerId, customerUser.id))
      .innerJoin(vendorUser, eq(thread.vendorId, vendorUser.id))
      .where(eq(thread.id, threadId));
    const msgs = await db
      .select()
      .from(message)
      .where(eq(message.threadId, threadId))
      .orderBy(asc(message.createdAt));
    const role = row.vendorId === this.user.id ? ("vendor" as const) : ("customer" as const);
    return {
      id: row.id,
      listingId: row.listingId,
      listingTitle: meta?.listingTitle ?? "",
      listingSlug: meta?.listingSlug ?? "",
      role,
      counterpartName: (role === "vendor" ? meta?.customerName : meta?.vendorName) ?? "",
      messages: msgs.map((m) => this.toMessageDTO(m)),
    };
  }

  async sendMessage(threadId: string, body: string): Promise<MessageDTO> {
    const row = await this.participantThread(threadId);
    const me = this.user.id;
    const inserted = await db.transaction(async (tx) => {
      const [msg] = await tx.insert(message).values({ threadId, senderId: me, body }).returning();
      if (!msg) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await tx.update(thread).set({ lastMessageAt: new Date() }).where(eq(thread.id, threadId));
      return msg;
    });
    if (row.vendorId === me) {
      // съобщението вече е персистнато — transient грешка в recompute не бива да проваля sendMessage
      try {
        await this.recomputeAvgResponse();
      } catch (e) {
        console.error("avgResponse recompute failed", e);
      }
    }
    // email до другия участник (recipient = ако аз съм vendor → customer, иначе vendor)
    const recipientId = row.vendorId === me ? row.customerId : row.vendorId;
    void this.notifyNewMessage(threadId, row.listingId, recipientId, body)
      .catch((e) => console.error("email failed", e));
    return this.toMessageDTO(inserted);
  }

  async markRead(threadId: string): Promise<void> {
    await this.participantThread(threadId);
    await db
      .update(message)
      .set({ readAt: new Date() })
      .where(and(eq(message.threadId, threadId), ne(message.senderId, this.user.id), isNull(message.readAt)));
  }

  async unreadCount(): Promise<number> {
    const me = this.user.id;
    const [row] = await db
      .select({ n: count() })
      .from(message)
      .innerJoin(thread, eq(message.threadId, thread.id))
      .where(and(
        or(eq(thread.customerId, me), eq(thread.vendorId, me)),
        ne(message.senderId, me),
        isNull(message.readAt),
      ));
    return row?.n ?? 0;
  }

  // ponytail: full recompute на всеки vendor reply, LIMIT 50 нишки; incremental при доказан обем
  private async recomputeAvgResponse(): Promise<void> {
    const me = this.user.id;
    await db.execute(sql`
      update "user" set avg_response_minutes = sub.avg_min
      from (
        select round(avg(extract(epoch from (fv.first_reply - t.created_at)) / 60))::int as avg_min
        from (
          select id, created_at from ${thread}
          where vendor_id = ${me}
          order by last_message_at desc
          limit 50
        ) t
        join (
          select thread_id, min(created_at) as first_reply
          from ${message}
          where sender_id = ${me}
          group by thread_id
        ) fv on fv.thread_id = t.id
      ) sub
      where "user".id = ${me}
    `);
  }
}
