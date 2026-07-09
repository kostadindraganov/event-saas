"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { cfImageUrl } from "@/lib/cf-image-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ImageUploader({ listingId, coverImageId }: { listingId: string; coverImageId: string | null }) {
  const t = useTranslations("Vendor.gallery");
  const tv = useTranslations("Vendor");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const listQO = trpc.media.listByListing.queryOptions({ listingId });
  const { data: images } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });
  const invalidateAndRefresh = () => { invalidate(); router.refresh(); };

  const requestUpload = useMutation(trpc.media.requestUpload.mutationOptions());
  const confirm = useMutation(trpc.media.confirm.mutationOptions({ onSuccess: invalidateAndRefresh }));
  const remove = useMutation(
    trpc.media.remove.mutationOptions({ onSuccess: invalidateAndRefresh, onError: () => toast.error(tv("errorSave")) }),
  );
  const setCover = useMutation(
    trpc.media.setCover.mutationOptions({ onSuccess: invalidateAndRefresh, onError: () => toast.error(tv("errorSave")) }),
  );

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { cfImageId, uploadURL } = await requestUpload.mutateAsync({ listingId });
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(uploadURL, { method: "POST", body: form });
        if (!res.ok) throw new Error("upload failed");
        await confirm.mutateAsync({ listingId, cfImageId });
      }
    } catch {
      toast.error(t("cfMissing"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? t("uploading") : t("addImages")}
      </Button>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images?.map((img) => {
          const url = cfImageUrl(img.cfImageId, "public");
          const isCover = img.id === coverImageId;
          return (
            <figure key={img.id} className="space-y-1">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- CF variants поемат resize-а
                <img src={url} alt="" className="aspect-[4/3] w-full rounded-md border object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md border text-xs text-muted-foreground">
                  {img.cfImageId}
                </div>
              )}
              <div className="flex items-center justify-between gap-1">
                {isCover ? (
                  <Badge>{t("cover")}</Badge>
                ) : (
                  <Button
                    type="button" variant="ghost" size="default"
                    onClick={() => setCover.mutate({ listingId, imageId: img.id })}
                  >
                    {t("setCover")}
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-11 text-destructive" aria-label={t("removeImage")}>✕</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("removeImage")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("removeConfirm")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate({ imageId: img.id })}>
                        {t("confirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
