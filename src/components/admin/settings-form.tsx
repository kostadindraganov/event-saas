"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BillingSettingsSchema, type BillingSettings } from "@/data/admin/admin.dto";

export function SettingsForm() {
  const t = useTranslations("Admin.settings");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settingsQO = trpc.admin.settings.get.queryOptions();
  const { data } = useQuery(settingsQO);

  const form = useForm<BillingSettings>({
    resolver: zodResolver(BillingSettingsSchema),
    values: data,
  });

  const save = useMutation(
    trpc.admin.settings.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: settingsQO.queryKey });
        toast.success(t("saved"));
      },
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  if (!data) return null;

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <fieldset className="space-y-4">
        <legend className="font-medium">{t("limitsTitle")}</legend>
        <div className="space-y-2">
          <Label htmlFor="standard">{t("standardLimit")}</Label>
          <Input id="standard" type="number" min={0} {...form.register("limits.standard", { valueAsNumber: true })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="premium">{t("premiumLimit")}</Label>
          <Input
            id="premium"
            type="number"
            min={0}
            {...form.register("limits.premiumPerCategory", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grace">{t("graceDays")}</Label>
          <Input id="grace" type="number" min={0} {...form.register("graceDays", { valueAsNumber: true })} />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-medium">{t("promoTitle")}</legend>
        <div className="space-y-2">
          <Label htmlFor="promoDuration">{t("promoDuration")}</Label>
          <Input
            id="promoDuration"
            type="number"
            min={1}
            {...form.register("promo.durationDays", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promoSlots">{t("promoSlots")}</Label>
          <Input
            id="promoSlots"
            type="number"
            min={0}
            {...form.register("promo.premiumSlots", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promoCarousel">{t("promoCarousel")}</Label>
          <Input
            id="promoCarousel"
            type="number"
            min={0}
            {...form.register("promo.carouselSize", { valueAsNumber: true })}
          />
        </div>
      </fieldset>
      <Button type="submit" className="h-11" disabled={save.isPending}>
        {save.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
