"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/reviews/star-rating";

function ReplyBox({ reviewId, initialText }: { reviewId: string; initialText: string | null }) {
  const t = useTranslations("Vendor.reviewsPanel");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialText ?? "");
  const [editing, setEditing] = useState(!initialText);

  const reply = useMutation(
    trpc.review.reply.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        void queryClient.invalidateQueries({ queryKey: trpc.review.listForOwner.queryKey() });
        toast.success(t("replySuccess"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  if (!editing) {
    return (
      <div className="mt-2 rounded-md bg-muted p-2">
        <p className="text-sm">{initialText}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-1 h-11" onClick={() => setEditing(true)}>
          {t("replyLabel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("replyPlaceholder")} />
      <Button
        type="button"
        className="h-11"
        disabled={text.trim().length < 3 || reply.isPending}
        onClick={() => reply.mutate({ reviewId, text: text.trim() })}
      >
        {reply.isPending ? t("replySubmitting") : t("replySubmit")}
      </Button>
    </div>
  );
}

function AnswerBox({ questionId }: { questionId: string }) {
  const t = useTranslations("Vendor.reviewsPanel");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const answer = useMutation(
    trpc.qa.answer.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.qa.listForOwner.queryKey() });
        toast.success(t("answerSuccess"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  return (
    <div className="mt-2 space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("answerPlaceholder")} />
      <Button
        type="button"
        className="h-11"
        disabled={text.trim().length < 2 || answer.isPending}
        onClick={() => answer.mutate({ questionId, text: text.trim() })}
      >
        {answer.isPending ? t("answerSubmitting") : t("answerSubmit")}
      </Button>
    </div>
  );
}

export function VendorReviews() {
  const t = useTranslations("Vendor.reviewsPanel");
  const trpc = useTRPC();
  const { data: reviews, isPending: reviewsPending } = useQuery(trpc.review.listForOwner.queryOptions());
  const { data: questions, isPending: questionsPending } = useQuery(trpc.qa.listForOwner.queryOptions());
  const unanswered = questions?.filter((q) => !q.answerText) ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-serif text-2xl">{t("reviewsSectionTitle")}</h2>
        {!reviewsPending && (!reviews || reviews.length === 0) && (
          <p className="text-sm text-muted-foreground">{t("emptyReviews")}</p>
        )}
        <ul className="space-y-3">
          {reviews?.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">{r.listingTitle}</p>
              <div className="mt-1 flex items-center gap-2">
                <StarRating value={r.ratingOverall} />
                <span className="font-medium">{r.title}</span>
                {r.status === "hidden_by_admin" && (
                  <Badge variant="destructive">{t("hiddenByAdmin")}</Badge>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
              <ReplyBox reviewId={r.id} initialText={r.replyText} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 font-serif text-2xl">{t("questionsTitle")}</h2>
        {!questionsPending && unanswered.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("emptyQuestions")}</p>
        )}
        <ul className="space-y-3">
          {unanswered.map((q) => (
            <li key={q.id} className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">{q.listingTitle}</p>
              <p className="mt-1 text-sm">{q.body}</p>
              <AnswerBox questionId={q.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
