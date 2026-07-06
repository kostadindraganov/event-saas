import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// ponytail: redirect hub; истинска профилна страница във Ф2
export default async function ProfilPage() {
  const locale = await getLocale();
  redirect({ href: "/profil/izbrani", locale });
}
