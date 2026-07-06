"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

export function SaveButton({ listingId }: { listingId: string }) {
  const t = useTranslations("Saved");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const idsQO = trpc.saved.ids.queryOptions(undefined, { enabled: !!session });
  const { data: ids } = useQuery(idsQO);
  const saved = ids?.includes(listingId) ?? false;

  const toggle = useMutation(
    trpc.saved.toggle.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: idsQO.queryKey });
        void queryClient.invalidateQueries({ queryKey: trpc.saved.list.queryKey() });
      },
      onError: () => toast.error(t("errorSave")),
    }),
  );

  return (
    <button
      type="button"
      aria-label={saved ? t("remove") : t("save")}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) {
          router.push("/vhod");
          return;
        }
        toggle.mutate({ listingId });
      }}
      className="flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground backdrop-blur transition-colors hover:bg-background"
    >
      <Heart className={cn("size-5", saved && "fill-primary text-primary")} />
    </button>
  );
}
