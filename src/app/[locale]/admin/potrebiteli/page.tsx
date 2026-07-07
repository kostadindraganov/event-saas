import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/data/users/require-user";
import { UsersTable } from "@/components/admin/users-table";

export default async function AdminUsersPage() {
  const t = await getTranslations("Admin.users");
  const user = await getCurrentUser();
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <UsersTable currentUserId={user!.id} />
    </main>
  );
}
