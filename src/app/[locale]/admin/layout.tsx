import { notFound } from "next/navigation";
import { getCurrentUser } from "@/data/users/require-user";
import { canAdmin } from "@/data/users/user.policy";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!canAdmin(user)) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <AdminNav />
      {children}
    </div>
  );
}
