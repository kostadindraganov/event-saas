"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X, Trash2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { AdminListingRowDTO } from "@/data/admin/admin.dto";

type Tab = "pending_approval" | "published";

function RejectDialog({ id }: { id: string }) {
  const t = useTranslations("Admin.pending");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  const reject = useMutation(
    trpc.admin.listing.reject.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setReason("");
        void queryClient.invalidateQueries({ queryKey: trpc.admin.listing.list.queryKey() });
        toast.success(t("rejectSuccess"));
      },
      onError: () => setError(true),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">
          <X /> {t("reject")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(false); }}
            placeholder={t("reasonPlaceholder")}
          />
          {reason.length > 0 && reason.trim().length < 3 && (
            <p role="alert" className="text-sm text-destructive">{t("reasonRequired")}</p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
        </div>
        <DialogFooter>
          <Button
            className="h-11"
            disabled={reject.isPending || reason.trim().length < 3}
            onClick={() => { setError(false); reject.mutate({ id, reason: reason.trim() }); }}
          >
            {reject.isPending ? t("rejecting") : t("rejectSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModerationRow({ row }: { row: AdminListingRowDTO }) {
  const t = useTranslations("Admin.pending");
  const locale = useLocale();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<"limitReached" | "generic" | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.listing.list.queryKey() });

  const approve = useMutation(
    trpc.admin.listing.approve.mutationOptions({
      onSuccess: () => { setErrorKey(null); invalidate(); toast.success(t("approveSuccess")); },
      onError: (err) => {
        if (err.data?.code === "FORBIDDEN" && err.message === "LIMIT_REACHED") setErrorKey("limitReached");
        else setErrorKey("generic");
      },
    }),
  );
  const remove = useMutation(
    trpc.admin.listing.remove.mutationOptions({
      onSuccess: () => { invalidate(); toast.success(t("removeSuccess")); },
      onError: () => setErrorKey("generic"),
    }),
  );

  const categoryName = locale === "bg" ? row.categoryNameBg : row.categoryNameEn;
  const createdDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.createdAt));

  return (
    <TableRow>
      <TableCell>{row.title}</TableCell>
      <TableCell>{categoryName}</TableCell>
      <TableCell>{row.cityName}</TableCell>
      <TableCell>
        <div>{row.ownerName}</div>
        <div className="text-xs text-muted-foreground">{row.ownerEmail}</div>
      </TableCell>
      <TableCell>{createdDate}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {row.status === "pending_approval" && (
            <>
              <Button className="h-11" disabled={approve.isPending} onClick={() => { setErrorKey(null); approve.mutate({ id: row.id }); }}>
                <Check /> {approve.isPending ? t("approving") : t("approve")}
              </Button>
              <RejectDialog id={row.id} />
            </>
          )}
          {row.status === "published" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11">
                  <Trash2 /> {t("remove")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("removeConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("removeConfirmBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: row.id })}
                  >
                    {remove.isPending ? t("removing") : t("removeConfirmAction")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {errorKey && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {errorKey === "limitReached" ? t("errorLimitReached") : t("errorGeneric")}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

const PAGE_LIMIT = 50;

export function ModerationQueue() {
  const t = useTranslations("Admin.pending");
  const trpc = useTRPC();
  const [tab, setTab] = useState<Tab>("pending_approval");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery(trpc.admin.listing.list.queryOptions({ status: tab, page, limit: PAGE_LIMIT }));

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1); // смяна на опашката ресетва пагинацията
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_LIMIT)) : 1;

  // при одобрение/премахване на последния елемент от последната страница данните "свиват" общия брой
  // страници под текущата — връщаме админа обратно към новата последна страница вместо да го оставим блокиран
  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === "pending_approval" ? "default" : "outline"} className="h-11" onClick={() => switchTab("pending_approval")}>
          {t("tabPending")}
        </Button>
        <Button variant={tab === "published" ? "default" : "outline"} className="h-11" onClick={() => switchTab("published")}>
          {t("tabPublished")}
        </Button>
      </div>
      {isLoading ? null : !data || data.items.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnTitle")}</TableHead>
                <TableHead>{t("columnCategory")}</TableHead>
                <TableHead>{t("columnCity")}</TableHead>
                <TableHead>{t("columnOwner")}</TableHead>
                <TableHead>{t("columnCreated")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => <ModerationRow key={row.id} row={row} />)}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" className="h-11" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("pagePrev")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("pageOf", { page, totalPages })}</span>
              <Button variant="outline" className="h-11" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {t("pageNext")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
