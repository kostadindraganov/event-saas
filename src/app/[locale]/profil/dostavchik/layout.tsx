"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// ponytail: "use client" за целия layout — активният pathname state изисква usePathname()
// (client-only hook, точно като mobile-bottom-nav.tsx); auth guard-ва родителският profil/layout.tsx.
export default function DostavchikLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Billing.nav");
  const pathname = usePathname();
  const tabs = [
    { href: "/profil/dostavchik/obiavi", label: t("listings") },
    { href: "/profil/dostavchik/abonament", label: t("subscription") },
  ] as const;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-border">
        {tabs.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
