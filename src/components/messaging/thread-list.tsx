"use client";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { cfImageUrl } from "@/lib/cf-image-url";
import { Badge } from "@/components/ui/badge";

export function ThreadList() {
  const t = useTranslations("Messages");
  const format = useFormatter();
  const trpc = useTRPC();
  const { data: threads, isPending } = useQuery(
    trpc.messaging.listThreads.queryOptions(undefined, { refetchInterval: 30000 }),
  );

  if (isPending) return null;
  if (!threads || threads.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="font-medium">{t("empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {threads.map((thread) => {
        const coverUrl = thread.coverImageId ? cfImageUrl(thread.coverImageId) : null;
        return (
          <li key={thread.id}>
            <Link
              href={`/profil/saobshtenia/${thread.id}`}
              className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-foreground/25"
            >
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {coverUrl && (
                  <Image src={coverUrl} alt="" fill sizes="56px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium">{thread.counterpartName}</p>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {format.dateTime(new Date(thread.lastMessageAt), { dateStyle: "short" })}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{thread.listingTitle}</p>
                <p className="truncate text-sm">{thread.lastMessageBody}</p>
              </div>
              {thread.unreadCount > 0 && (
                <Badge aria-label={t("unread", { count: thread.unreadCount })} className="shrink-0 tabular-nums">
                  {thread.unreadCount}
                </Badge>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
