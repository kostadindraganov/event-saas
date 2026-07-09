"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VideoList({ listingId }: { listingId: string }) {
  const t = useTranslations("Vendor.gallery");
  const tv = useTranslations("Vendor");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");

  const listQO = trpc.catalog.video.listByListing.queryOptions({ listingId });
  const { data: videos } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });

  const add = useMutation(
    trpc.catalog.video.add.mutationOptions({
      onSuccess: () => { setUrl(""); invalidate(); },
      onError: () => toast.error(t("invalidVideo")),
    }),
  );
  const remove = useMutation(
    trpc.catalog.video.remove.mutationOptions({ onSuccess: invalidate, onError: () => toast.error(tv("errorSave")) }),
  );

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (url.trim()) add.mutate({ listingId, url: url.trim() }); }}
      >
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("videoUrl")} />
        <Button type="submit" disabled={add.isPending}>{t("addVideo")}</Button>
      </form>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {videos?.map((v) => (
          <figure key={v.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- youtube thumb */}
            <img
              src={`https://img.youtube.com/vi/${v.youtubeId}/mqdefault.jpg`}
              alt=""
              className="aspect-video w-full rounded-md border object-cover"
            />
            <Button
              type="button" variant="secondary" size="icon"
              className="absolute right-1 top-1 size-11"
              aria-label={t("removeVideo")}
              onClick={() => remove.mutate({ id: v.id })}
            >
              ✕
            </Button>
          </figure>
        ))}
      </div>
    </div>
  );
}
