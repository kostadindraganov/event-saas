"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const STEPS = ["osnovni", "atributi", "galeria", "paketi", "pregled"] as const;
export type WizardStep = (typeof STEPS)[number];

export function WizardNav({
  current,
  listingId,
  position,
}: {
  current: WizardStep;
  listingId: string;
  position: "top" | "bottom";
}) {
  const t = useTranslations("Vendor.wizard");
  const idx = STEPS.indexOf(current);
  const href = (s: WizardStep) => `/profil/dostavchik/obiavi/${listingId}?step=${s}`;

  if (position === "top") {
    return (
      <nav className="flex flex-wrap gap-1 border-b pb-3 text-sm">
        {STEPS.map((s, i) => (
          <Link
            key={s}
            href={href(s)}
            className={cn(
              "rounded-full px-3 py-1",
              s === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {i + 1}. {t(s)}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <div className="flex justify-between border-t pt-4">
      {idx > 0 ? (
        <Button asChild variant="outline">
          <Link href={href(STEPS[idx - 1]!)}>{t("back")}</Link>
        </Button>
      ) : <span />}
      {idx < STEPS.length - 1 && (
        <Button asChild>
          <Link href={href(STEPS[idx + 1]!)}>{t("next")}</Link>
        </Button>
      )}
    </div>
  );
}
