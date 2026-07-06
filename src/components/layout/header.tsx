"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function Header() {
  const t = useTranslations("Common");
  const tVendor = useTranslations("Vendor");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-serif text-xl font-semibold">
          {t("appName")}
        </Link>
        <nav className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(pathname, { locale: locale === "bg" ? "en" : "bg" })}
          >
            {locale === "bg" ? "EN" : "БГ"}
          </Button>
          {session ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/profil/dostavchik/obiavi">{tVendor("myListings")}</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => authClient.signOut()}>
                {t("signOut")}
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/vhod">{t("signIn")}</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
