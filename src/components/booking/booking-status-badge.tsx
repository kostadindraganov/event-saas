import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/data/booking/booking.dto";

const VARIANT: Record<BookingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  confirmed: "default",
  declined: "destructive",
  auto_declined: "destructive",
  completed: "secondary",
  cancelled_by_customer: "destructive",
  cancelled_by_vendor: "destructive",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("Booking.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
