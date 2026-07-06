import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ListingStatus } from "@/data/catalog/catalog.dto";

const VARIANT: Record<ListingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "outline",
  published: "default",
  hidden: "outline",
  rejected: "destructive",
  removed: "destructive",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const t = useTranslations("Vendor.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
