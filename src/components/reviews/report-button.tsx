"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "review" | "question" | "listing";
  targetId: string;
}) {
  const t = useTranslations("Report");
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  const report = useMutation(
    trpc.report.create.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setReason("");
        toast.success(t("successToast"));
      },
      onError: () => setError(true),
    }),
  );

  if (!session) {
    return (
      <Link href="/vhod" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <Flag className="size-3.5" aria-hidden="true" />
        {t("button")}
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setReason(""); setError(false); } }}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <Flag className="size-3.5" aria-hidden="true" /> {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(false); }}
            placeholder={t("reasonPlaceholder")}
          />
          {reason.length > 0 && reason.trim().length < 3 && (
            <p role="alert" className="text-sm text-destructive">{t("reasonTooShort")}</p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="h-11"
            disabled={report.isPending || reason.trim().length < 3}
            onClick={() => report.mutate({ targetType, targetId, reason: reason.trim() })}
          >
            {report.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
