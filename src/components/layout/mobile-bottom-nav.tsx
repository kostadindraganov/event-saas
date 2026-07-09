"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search, Heart, MessageCircle, User, Settings } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const t = useTranslations("Messages");
  const tAccount = useTranslations("Account");
  const pathname = usePathname();
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const { data: unread } = useQuery(
    trpc.messaging.unreadCount.queryOptions(undefined, {
      enabled: !!session,
      refetchInterval: 30000,
    }),
  );

  const tabs = [
    { href: "/tarsene", label: t("navSearch"), Icon: Search },
    { href: "/profil/izbrani", label: t("navSaved"), Icon: Heart },
    { href: "/profil/saobshtenia", label: t("navMessages"), Icon: MessageCircle, badge: unread },
    { href: "/profil", label: t("navProfile"), Icon: User },
    { href: "/profil/nastroiki", label: tAccount("navLabel"), Icon: Settings },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex h-16 max-w-6xl">
        {tabs.map(({ href, label, Icon, ...rest }) => {
          const active =
            href === "/profil"
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
          const badge = "badge" in rest ? rest.badge : undefined;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
                {badge != null && badge > 0 && (
                  <Badge
                    aria-label={t("unread", { count: badge })}
                    className="absolute right-1/2 top-1.5 translate-x-3 tabular-nums"
                  >
                    {badge}
                  </Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
