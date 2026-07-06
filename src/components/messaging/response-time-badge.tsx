import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export async function ResponseTimeBadge({ avgResponseMinutes }: { avgResponseMinutes: number | null }) {
  if (avgResponseMinutes === null || avgResponseMinutes > 1440) return null;
  const t = await getTranslations("Messages");
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Clock className="size-3" />
      {t("respondsWithin24h")}
    </Badge>
  );
}
