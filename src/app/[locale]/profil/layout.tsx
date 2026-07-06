import { getCurrentUser } from "@/data/users/require-user";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const locale = await getLocale();
  if (!user) redirect({ href: "/vhod", locale });
  return <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>;
}
