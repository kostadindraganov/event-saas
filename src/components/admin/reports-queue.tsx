"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { EyeOff, Trash2, X } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { ReportRowDTO } from "@/data/admin/admin.dto";

function ResolveDialog({
  row,
  action,
  trigger,
}: {
  row: ReportRowDTO;
  action: "hide" | "remove";
  trigger: React.ReactNode;
}) {
  const t = useTranslations("Admin.reports");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState("");
  const [open, setOpen] = useState(false);

  const resolve = useMutation(
    trpc.admin.report.resolve.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setResolution("");
        void queryClient.invalidateQueries({ queryKey: trpc.admin.report.list.queryKey() });
        toast.success(action === "hide" ? t("hideSuccess") : t("removeSuccess"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResolution(""); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action === "hide" ? t("hideConfirmTitle") : t("removeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{action === "hide" ? t("hideConfirmBody") : t("removeConfirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={t("resolutionPlaceholder")} />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={action === "remove" ? "destructive" : "default"}
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: row.id, action, resolution: resolution.trim() || undefined })}
          >
            {action === "hide" ? t("hide") : t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReportRow({ row }: { row: ReportRowDTO }) {
  const t = useTranslations("Admin.reports");
  const locale = useLocale();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const dismiss = useMutation(
    trpc.admin.report.resolve.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.admin.report.list.queryKey() });
        toast.success(t("dismissSuccess"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  const typeLabel = row.targetType === "review" ? t("typeReview") : row.targetType === "question" ? t("typeQuestion") : t("typeListing");
  const createdDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.createdAt));

  return (
    <TableRow>
      <TableCell><Badge variant="outline">{typeLabel}</Badge></TableCell>
      <TableCell className="max-w-xs truncate">{row.targetExcerpt ?? t("deletedContent")}</TableCell>
      <TableCell className="max-w-xs">{row.reason}</TableCell>
      <TableCell>{row.reporterEmail}</TableCell>
      <TableCell>{createdDate}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <ResolveDialog
            row={row}
            action="hide"
            trigger={<Button variant="outline" className="h-11"><EyeOff /> {t("hide")}</Button>}
          />
          <ResolveDialog
            row={row}
            action="remove"
            trigger={<Button variant="destructive" className="h-11"><Trash2 /> {t("remove")}</Button>}
          />
          <Button
            variant="ghost"
            className="h-11"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate({ id: row.id, action: "dismiss" })}
          >
            <X /> {dismiss.isPending ? t("dismissing") : t("dismiss")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ReportsQueue() {
  const t = useTranslations("Admin.reports");
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.admin.report.list.queryOptions());

  if (isLoading) return null;
  if (!data || data.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnType")}</TableHead>
          <TableHead>{t("columnContent")}</TableHead>
          <TableHead>{t("columnReason")}</TableHead>
          <TableHead>{t("columnReporter")}</TableHead>
          <TableHead>{t("columnCreated")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => <ReportRow key={row.id} row={row} />)}
      </TableBody>
    </Table>
  );
}
