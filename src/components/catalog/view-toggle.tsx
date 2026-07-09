"use client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ViewToggle({ view }: { view: "list" | "map" }) {
  const t = useTranslations("Catalog");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(next: "list" | "map") {
    if (next === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "map") params.set("view", "map");
    else params.delete("view");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex h-11 rounded-md border border-border p-0.5" role="group" aria-label={t("viewToggleLabel")}>
      <Button
        type="button"
        variant={view === "list" ? "default" : "ghost"}
        size="sm"
        className="h-full rounded-sm"
        aria-pressed={view === "list"}
        onClick={() => go("list")}
      >
        {t("viewList")}
      </Button>
      <Button
        type="button"
        variant={view === "map" ? "default" : "ghost"}
        size="sm"
        className="h-full rounded-sm"
        aria-pressed={view === "map"}
        onClick={() => go("map")}
      >
        {t("viewMap")}
      </Button>
    </div>
  );
}
