import { getLocale, getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/reviews/star-rating";
import { ReportButton } from "@/components/reviews/report-button";
import { cfImageUrl } from "@/lib/cf-image-url";
import type { ReviewPublicDTO } from "@/data/reviews/review.dto";

export async function ReviewsSection({ reviews }: { reviews: ReviewPublicDTO[] }) {
  const t = await getTranslations("Review");
  const locale = await getLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-serif text-2xl">{t("sectionTitle")}</h2>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <StarRating value={r.ratingOverall} />
                    <span className="font-medium">{r.authorName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{dateFormat.format(r.createdAt)}</p>
                </div>
                {r.wouldRecommend && (
                  <Badge variant="secondary">
                    <Check className="size-3" aria-hidden="true" /> {t("wouldRecommend")}
                  </Badge>
                )}
              </div>
              <h3 className="mt-2 font-medium">{r.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{r.body}</p>
              {r.images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {r.images.map((img) => {
                    const url = cfImageUrl(img.cfImageId, "public");
                    return url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- CF variants поемат resize-а
                      <img
                        key={img.id}
                        src={url}
                        alt={img.alt ?? t("reviewImageFallbackAlt", { author: r.authorName })}
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                    ) : null;
                  })}
                </div>
              )}
              {r.replyText && (
                <div className="mt-3 rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t("vendorReplyLabel")}</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{r.replyText}</p>
                </div>
              )}
              <div className="mt-3">
                <ReportButton targetType="review" targetId={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
