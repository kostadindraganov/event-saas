"use client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CatalogSort({ sort }: { sort: "new" | "priceAsc" | "priceDesc" }) {
  const t = useTranslations("Catalog");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "new") params.delete("sort");
    else params.set("sort", value);
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={sort} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-[190px]" aria-label={t("sortLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="new">{t("sortNew")}</SelectItem>
        <SelectItem value="priceAsc">{t("sortPriceAsc")}</SelectItem>
        <SelectItem value="priceDesc">{t("sortPriceDesc")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
