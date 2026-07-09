"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CONFIRM_WORD = "ИЗТРИЙ";

export function DeleteAccount() {
  const t = useTranslations("Account");
  const trpc = useTRPC();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const del = useMutation(
    trpc.account.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("deleted"));
        router.push("/");
      },
      onError: (err) => {
        setError(err.message === "HAS_FUTURE_BOOKINGS" ? t("hasFutureBookings") : t("errorGeneric"));
      },
    }),
  );

  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <p className="font-medium">{t("deleteTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("deleteDesc")}</p>
        <AlertDialog onOpenChange={(o) => { if (!o) { setConfirmation(""); setError(null); } }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="h-11">{t("deleteButton")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">{t("deleteConfirmLabel")}</Label>
              <Input
                id="delete-confirmation"
                value={confirmation}
                onChange={(e) => { setConfirmation(e.target.value); setError(null); }}
                autoComplete="off"
              />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={confirmation !== CONFIRM_WORD || del.isPending}
                onClick={() => del.mutate({ confirmation })}
              >
                {t("deleteButton")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
