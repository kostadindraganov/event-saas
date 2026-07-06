"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cfImageUrl } from "@/lib/cf-image-url";

export function ListingGallery({
  images,
  videos,
  title,
}: {
  images: { cfImageId: string; sortOrder: number }[];
  videos: { youtubeVideoId: string }[];
  title: string;
}) {
  const t = useTranslations("Listing");
  const photos = [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ id: i.cfImageId, url: cfImageUrl(i.cfImageId) }))
    .filter((p): p is { id: string; url: string } => p.url !== null);

  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState<Set<string>>(new Set());

  const prev = useCallback(
    () => setIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i === null ? i : (i + 1) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, prev, next]);

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted"
            >
              <Image
                src={p.url}
                alt={`${title} — ${i + 1}`}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <div
              key={v.youtubeVideoId}
              className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted"
            >
              {playing.has(v.youtubeVideoId) ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${v.youtubeVideoId}?autoplay=1`}
                  title={t("videoLabel")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setPlaying((s) => new Set(s).add(v.youtubeVideoId))
                  }
                  className="h-full w-full"
                  aria-label={t("videoLabel")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- YT thumbnail, извън next/image remotePatterns */}
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtubeVideoId}/hqdefault.jpg`}
                    alt={t("videoLabel")}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-background/90">
                      <Play className="size-6" />
                    </span>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {index !== null && (
            <div className="relative aspect-[4/3] w-full">
              <Image
                src={photos[index]!.url}
                alt={`${title} — ${index + 1}`}
                fill
                sizes="90vw"
                className="object-contain"
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    aria-label={t("prevImage")}
                    className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label={t("nextImage")}
                    className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
