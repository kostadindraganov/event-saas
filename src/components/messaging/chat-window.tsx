"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useFormatter } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ChatWindow({ threadId }: { threadId: string }) {
  const t = useTranslations("Messages");
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadQO = trpc.messaging.getThread.queryOptions(
    { threadId },
    { refetchInterval: 5000 },
  );
  const { data: thread, isError: threadError } = useQuery(threadQO);

  const markRead = useMutation(
    trpc.messaging.markRead.mutationOptions({
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: trpc.messaging.unreadCount.queryKey() }),
      onError: () => console.error("markRead failed"),
    }),
  );
  const sendMessage = useMutation(
    trpc.messaging.sendMessage.mutationOptions({
      onSuccess: () => {
        setBody("");
        void queryClient.invalidateQueries({ queryKey: threadQO.queryKey });
      },
      onError: () => setError(true),
    }),
  );

  // markRead веднъж при отваряне на нишката + invalidate unreadCount
  // ponytail: firing on threadId mount; сървърът маркира само чужди непрочетени
  useEffect(() => {
    markRead.mutate({ threadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // auto-scroll до дъно при нови съобщения
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  if (threadError) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t("threadNotFound")}</p>
        <Link href="/profil/saobshtenia" className="text-sm font-medium underline underline-offset-4">
          {t("back")}
        </Link>
      </div>
    );
  }

  if (!thread) return null;

  const valid = body.trim().length >= 1;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <header className="mb-3 flex items-center gap-3 border-b border-border pb-3">
        <Button asChild variant="ghost" size="icon" className="size-11" aria-label={t("back")}>
          <Link href="/profil/saobshtenia">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0">
          <Link href={`/obiava/${thread.listingSlug}`} className="block truncate font-medium hover:underline">
            {thread.listingTitle}
          </Link>
          <p className="truncate text-sm text-muted-foreground">{thread.counterpartName}</p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {thread.messages.map((m, i) => (
          <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                m.mine ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {i === 0 && (m.eventDate || m.phone) && (
                <div className="mb-1 space-y-0.5 text-xs opacity-80">
                  {m.eventDate && <p>{t("eventDateLabel")}: {m.eventDate}</p>}
                  {m.phone && <p>{t("phoneLabel")}: {m.phone}</p>}
                </div>
              )}
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
            <span className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {format.dateTime(new Date(m.createdAt), { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 space-y-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(false);
          if (!valid) return;
          sendMessage.mutate({ threadId, body: body.trim() });
        }}
      >
        {error && <p role="alert" className="text-sm text-destructive">{t("errorSend")}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("composePlaceholder")}
            maxLength={2000}
            rows={2}
            className="flex-1"
          />
          <Button type="submit" disabled={!valid || sendMessage.isPending}>
            {sendMessage.isPending ? t("sending") : t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}
