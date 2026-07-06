"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SearchHero({
  categories,
}: {
  categories: { slug: string; nameBg: string; nameEn: string }[];
}) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (category) {
      router.push(`/${category}`);
      return;
    }
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    router.push(qs ? `/tarsene?${qs}` : "/tarsene");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="h-12 flex-1"
      />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-12 sm:w-56" aria-label={t("allCategories")}>
          <SelectValue placeholder={t("allCategories")} />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {locale === "bg" ? c.nameBg : c.nameEn}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="lg" className="h-12">
        {t("searchButton")}
      </Button>
    </form>
  );
}
