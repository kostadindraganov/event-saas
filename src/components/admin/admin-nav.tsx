"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// ponytail: "use client" само за навигацията (usePathname) — guard-ът остава в RSC layout-а,
// pattern 1:1 с profil/dostavchik/layout.tsx.
export function AdminNav() {
  const t = useTranslations("Admin.nav");
  const pathname = usePathname();
  const tabs = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/obiavi", label: t("pending") },
    { href: "/admin/potrebiteli", label: t("users") },
    { href: "/admin/taksonomia", label: t("taxonomy") },
    { href: "/admin/nastroyki", label: t("settings") },
    { href: "/admin/signali", label: t("reports") },
  ] as const;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
