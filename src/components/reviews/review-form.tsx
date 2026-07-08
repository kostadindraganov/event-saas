"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StarRatingInput } from "@/components/reviews/star-rating";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { SUB_RATING_KEYS } from "@/data/reviews/review.dto";
import type { MyBookingDTO } from "@/data/booking/booking.dto";

type SubRating = (typeof SUB_RATING_KEYS)[number];
const MAX_IMAGES = 5;
const EMPTY_RATINGS: Record<SubRating, number> = {
  quality: 0, communication: 0, professionalism: 0, value: 0, flexibility: 0,
};

export function ReviewForm({ booking }: { booking: MyBookingDTO }) {
  const t = useTranslations("Review.form");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<SubRating, number>>(EMPTY_RATINGS);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [errorKey, setErrorKey] = useState<"alreadyReviewed" | "notCompleted" | "generic" | null>(null);
  const [uploading, setUploading] = useState(false);

  function reset() {
    setRatings(EMPTY_RATINGS);
    setTitle("");
    setBody("");
    setWouldRecommend(false);
    setFiles([]);
    setErrorKey(null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const requestUpload = useMutation(trpc.review.requestUpload.mutationOptions());
  const confirmUpload = useMutation(trpc.review.confirmUpload.mutationOptions());

  const create = useMutation(
    trpc.review.create.mutationOptions({
      onSuccess: async ({ id }) => {
        if (files.length > 0) {
          setUploading(true);
          try {
            for (const file of files) {
              const { cfImageId, uploadURL } = await requestUpload.mutateAsync({ reviewId: id });
              const form = new FormData();
              form.append("file", file);
              const res = await fetch(uploadURL, { method: "POST", body: form });
              if (!res.ok) throw new Error("upload failed");
              await confirmUpload.mutateAsync({ reviewId: id, cfImageId });
            }
          } catch {
            toast.error(t("cfMissing"));
          } finally {
            setUploading(false);
          }
        }
        void queryClient.invalidateQueries({ queryKey: trpc.booking.listMine.queryKey() });
        toast.success(t("successToast"));
        setOpen(false);
        reset();
      },
      onError: (err) => {
        if (err.data?.code === "CONFLICT" && err.message === "ALREADY_REVIEWED") setErrorKey("alreadyReviewed");
        else if (err.data?.code === "CONFLICT" && err.message === "NOT_COMPLETED") setErrorKey("notCompleted");
        else setErrorKey("generic");
      },
    }),
  );

  const titleValid = title.trim().length >= 3;
  const bodyValid = body.trim().length >= 10;
  const ratingsValid = SUB_RATING_KEYS.every((k) => ratings[k] >= 1);
  const canSubmit = titleValid && bodyValid && ratingsValid && !create.isPending && !uploading;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" className="h-11">{t("cta")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {SUB_RATING_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <Label>{t(`rating.${key}`)}</Label>
              <StarRatingInput
                value={ratings[key]}
                onChange={(v) => setRatings((r) => ({ ...r, [key]: v }))}
                label={t(`rating.${key}`)}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="review-title">{t("titleLabel")}</Label>
            <Input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
            {title.length > 0 && !titleValid && <p role="alert" className="text-sm text-destructive">{t("titleTooShort")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-body">{t("bodyLabel")}</Label>
            <Textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("bodyPlaceholder")} />
            {body.length > 0 && !bodyValid && <p role="alert" className="text-sm text-destructive">{t("bodyTooShort")}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="review-recommend" checked={wouldRecommend} onCheckedChange={(c) => setWouldRecommend(c === true)} />
            <Label htmlFor="review-recommend">{t("wouldRecommendLabel")}</Label>
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_IMAGES))}
            />
            <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()}>
              {t("addImages")}
            </Button>
            {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length}</p>}
          </div>
          {errorKey && (
            <p role="alert" className="text-sm text-destructive">
              {errorKey === "alreadyReviewed" ? t("errorAlreadyReviewed") : errorKey === "notCompleted" ? t("errorNotCompleted") : t("errorGeneric")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="h-11"
            disabled={!canSubmit}
            onClick={() => {
              setErrorKey(null);
              create.mutate({
                bookingId: booking.id,
                ratingQuality: ratings.quality,
                ratingCommunication: ratings.communication,
                ratingProfessionalism: ratings.professionalism,
                ratingValue: ratings.value,
                ratingFlexibility: ratings.flexibility,
                title: title.trim(),
                body: body.trim(),
                wouldRecommend,
              });
            }}
          >
            {create.isPending || uploading ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
