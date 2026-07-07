"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { AdminUserDTO } from "@/data/admin/admin.dto";

// self-guard грешка от сървъра (Задача 6): FORBIDDEN/"SELF_ACTION"
function isSelfActionError(err: { data?: { code?: string } | null; message: string }) {
  return err.data?.code === "FORBIDDEN" && err.message === "SELF_ACTION";
}

function AdminToggle({ row }: { row: AdminUserDTO }) {
  const t = useTranslations("Admin.users");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setAdmin = useMutation(
    trpc.admin.user.setAdmin.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.admin.user.list.queryKey() });
        toast.success(t("successUpdated"));
      },
      onError: (err) => toast.error(isSelfActionError(err) ? t("cannotBlockSelf") : t("errorGeneric")),
    }),
  );
  return (
    <Switch
      checked={row.isAdmin}
      disabled={setAdmin.isPending}
      onCheckedChange={(checked) => setAdmin.mutate({ id: row.id, isAdmin: checked })}
    />
  );
}

function BlockAction({ row, isSelf }: { row: AdminUserDTO; isSelf: boolean }) {
  const t = useTranslations("Admin.users");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const blocked = row.deletedAt !== null;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.admin.user.list.queryKey() });

  const block = useMutation(
    trpc.admin.user.block.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success(t("successUpdated"));
      },
      onError: (err) => toast.error(isSelfActionError(err) ? t("cannotBlockSelf") : t("errorGeneric")),
    }),
  );
  const unblock = useMutation(
    trpc.admin.user.unblock.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success(t("successUpdated"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  if (blocked) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="h-11">
            {t("unblock")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("unblockConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("unblockConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={unblock.isPending} onClick={() => unblock.mutate({ id: row.id })}>
              {t("unblock")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (isSelf) {
    return <p className="text-xs text-muted-foreground">{t("cannotBlockSelf")}</p>;
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-11">
          {t("block")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("blockConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("blockConfirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={block.isPending} onClick={() => block.mutate({ id: row.id })}>
            {t("block")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UsersTable({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations("Admin.users");
  const locale = useLocale();
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.admin.user.list.queryOptions());

  if (isLoading || !data) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnName")}</TableHead>
          <TableHead>{t("columnEmail")}</TableHead>
          <TableHead>{t("columnJoined")}</TableHead>
          <TableHead>{t("columnAdmin")}</TableHead>
          <TableHead>{t("columnStatus")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.createdAt))}</TableCell>
            <TableCell>
              <AdminToggle row={row} />
            </TableCell>
            <TableCell>
              <Badge variant={row.deletedAt ? "destructive" : "default"}>
                {row.deletedAt ? t("statusBlocked") : t("statusActive")}
              </Badge>
            </TableCell>
            <TableCell>
              <BlockAction row={row} isSelf={row.id === currentUserId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
