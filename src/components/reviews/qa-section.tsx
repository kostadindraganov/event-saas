"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function QaSection({ listingId }: { listingId: string }) {
  const t = useTranslations("Qa");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [question, setQuestion] = useState("");
  const [errorKey, setErrorKey] = useState<"errorGeneric" | "tooManyRequests" | null>(null);

  const listQO = trpc.qa.listByListing.queryOptions({ listingId });
  const { data: questions, isPending } = useQuery(listQO);

  const ask = useMutation(
    trpc.qa.ask.mutationOptions({
      onSuccess: () => {
        setQuestion("");
        setErrorKey(null);
        void queryClient.invalidateQueries({ queryKey: listQO.queryKey });
        toast.success(t("askSuccess"));
      },
      onError: (err) => setErrorKey(err.data?.code === "TOO_MANY_REQUESTS" ? "tooManyRequests" : "errorGeneric"),
    }),
  );

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const questionValid = question.trim().length >= 5;

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-serif text-2xl">{t("sectionTitle")}</h2>
      {!isPending && (!questions || questions.length === 0) && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {questions && questions.length > 0 && (
        <ul className="mb-4 space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-border p-3">
              <p className="text-sm">{q.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{dateFormat.format(q.createdAt)}</p>
              {q.answerText ? (
                <div className="mt-2 rounded-md bg-muted p-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("answerLabel")}</p>
                  <p className="mt-1 text-sm">{q.answerText}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t("unanswered")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {session ? (
        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(e) => { setQuestion(e.target.value); setErrorKey(null); }}
            placeholder={t("askPlaceholder")}
          />
          {question.length > 0 && !questionValid && <p role="alert" className="text-sm text-destructive">{t("bodyTooShort")}</p>}
          {errorKey && <p role="alert" className="text-sm text-destructive">{errorKey === "tooManyRequests" ? tc("tooManyRequests") : t("errorGeneric")}</p>}
          <Button
            type="button"
            className="h-11"
            disabled={!questionValid || ask.isPending}
            onClick={() => ask.mutate({ listingId, body: question.trim() })}
          >
            {ask.isPending ? t("asking") : t("ask")}
          </Button>
        </div>
      ) : (
        <Link href="/vhod" className="text-sm text-primary underline">{t("loginToAsk")}</Link>
      )}
    </section>
  );
}
