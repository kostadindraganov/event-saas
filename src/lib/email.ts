import "server-only";
import { Resend } from "resend";
import { getBaseUrl } from "@/lib/seo";

let warned = false;

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warned) {
      console.warn("RESEND_API_KEY липсва — email-ите са изключени");
      warned = true;
    }
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function newMessageEmail(input: {
  recipientName: string; listingTitle: string; body: string; threadUrl: string;
}): { subject: string; html: string } {
  const subject = `Ново съобщение за „${input.listingTitle}“`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.recipientName)},</p>
  <p>Имате ново съобщение относно обявата <strong>${escapeHtml(input.listingTitle)}</strong>:</p>
  <blockquote style="border-left:3px solid #ddd;margin:0;padding:0 0 0 12px;color:#333">${escapeHtml(input.body)}</blockquote>
  <p><a href="${input.threadUrl}">Виж разговора</a></p>
</div>`;
  return { subject, html };
}

export function subscriptionPastDueEmail(input: { graceUntil: Date }): { subject: string; html: string } {
  const subject = "Проблем с плащането на абонамента Ви";
  const dateStr = input.graceUntil.toLocaleDateString("bg-BG", { year: "numeric", month: "long", day: "numeric" });
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте,</p>
  <p>Опитът за подновяване на абонамента Ви не бе успешен. Имате 7-дневен гратис период да актуализирате начина на плащане.</p>
  <p>Ако не бъде разрешено до <strong>${dateStr}</strong>, публикуваните Ви обяви ще бъдат временно скрити.</p>
  <p><a href="${getBaseUrl()}/profil/dostavchik/abonament">Управление на абонамента</a></p>
</div>`;
  return { subject, html };
}

export function listingsHiddenEmail(input: { count: number }): { subject: string; html: string } {
  const subject = "Обявите Ви бяха скрити";
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте,</p>
  <p>${input.count} от публикуваните Ви обяви бяха автоматично скрити поради проблем с абонамента.</p>
  <p>Възстановете абонамента, за да ги публикувате отново.</p>
  <p><a href="${getBaseUrl()}/profil/dostavchik/abonament">Управление на абонамента</a></p>
</div>`;
  return { subject, html };
}

export function listingApprovedEmail(input: { listingTitle: string; listingUrl: string }): { subject: string; html: string } {
  const subject = `Обявата Ви „${input.listingTitle}" е одобрена`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте,</p>
  <p>Обявата Ви <strong>${escapeHtml(input.listingTitle)}</strong> бе прегледана и одобрена — вече е публично видима.</p>
  <p><a href="${input.listingUrl}">Виж обявата</a></p>
</div>`;
  return { subject, html };
}

export function listingRejectedEmail(input: { listingTitle: string; reason: string; editUrl: string }): { subject: string; html: string } {
  const subject = `Обявата Ви „${input.listingTitle}" бе отхвърлена`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте,</p>
  <p>Обявата Ви <strong>${escapeHtml(input.listingTitle)}</strong> не бе одобрена по следната причина:</p>
  <blockquote style="border-left:3px solid #ddd;margin:0;padding:0 0 0 12px;color:#333">${escapeHtml(input.reason)}</blockquote>
  <p>Можете да редактирате обявата и да я подадете отново за преглед.</p>
  <p><a href="${input.editUrl}">Редактирай обявата</a></p>
</div>`;
  return { subject, html };
}

export function bookingRequestedEmail(input: {
  vendorName: string; listingTitle: string; eventDate: string; calendarUrl: string;
}): { subject: string; html: string } {
  const subject = `Нова заявка за резервация — „${input.listingTitle}"`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.vendorName)},</p>
  <p>Получихте нова заявка за резервация за обявата <strong>${escapeHtml(input.listingTitle)}</strong> на дата <strong>${escapeHtml(input.eventDate)}</strong>.</p>
  <p><a href="${input.calendarUrl}">Виж заявката в календара</a></p>
</div>`;
  return { subject, html };
}

export function bookingConfirmedEmail(input: {
  customerName: string; listingTitle: string; eventDate: string; bookingUrl: string;
}): { subject: string; html: string } {
  const subject = `Резервацията Ви за „${input.listingTitle}" е потвърдена`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.customerName)},</p>
  <p>Резервацията Ви за <strong>${escapeHtml(input.listingTitle)}</strong> на дата <strong>${escapeHtml(input.eventDate)}</strong> бе потвърдена.</p>
  <p><a href="${input.bookingUrl}">Виж резервацията</a></p>
</div>`;
  return { subject, html };
}

export function bookingDeclinedEmail(input: {
  customerName: string; listingTitle: string; eventDate: string; reason: string; listingUrl: string;
}): { subject: string; html: string } {
  const subject = `Резервацията Ви за „${input.listingTitle}" бе отказана`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.customerName)},</p>
  <p>Резервацията Ви за <strong>${escapeHtml(input.listingTitle)}</strong> на дата <strong>${escapeHtml(input.eventDate)}</strong> бе отказана по следната причина:</p>
  <blockquote style="border-left:3px solid #ddd;margin:0;padding:0 0 0 12px;color:#333">${escapeHtml(input.reason)}</blockquote>
  <p><a href="${input.listingUrl}">Виж обявата</a></p>
</div>`;
  return { subject, html };
}

export function reviewReminderEmail(input: { listingTitle: string; reviewUrl: string }): { subject: string; html: string } {
  const subject = `Как мина събитието с „${input.listingTitle}"?`;
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте,</p>
  <p>Дано събитието с <strong>${escapeHtml(input.listingTitle)}</strong> е минало чудесно! Ще ни помогнете ли, като споделите ревю за изживяването си?</p>
  <p><a href="${input.reviewUrl}">Напишете ревю</a></p>
</div>`;
  return { subject, html };
}

export function bookingCancelledEmail(input: {
  recipientName: string; listingTitle: string; eventDate: string; reason: string;
  cancelledBy: "customer" | "vendor"; bookingUrl: string;
}): { subject: string; html: string } {
  const subject = `Резервацията за „${input.listingTitle}" бе отменена`;
  const byLabel = input.cancelledBy === "customer" ? "клиента" : "доставчика";
  const html = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p>Здравейте, ${escapeHtml(input.recipientName)},</p>
  <p>Резервацията за <strong>${escapeHtml(input.listingTitle)}</strong> на дата <strong>${escapeHtml(input.eventDate)}</strong> бе отменена от ${byLabel} по следната причина:</p>
  <blockquote style="border-left:3px solid #ddd;margin:0;padding:0 0 0 12px;color:#333">${escapeHtml(input.reason)}</blockquote>
  <p><a href="${input.bookingUrl}">Виж детайли</a></p>
</div>`;
  return { subject, html };
}
