"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import { formatEuro, parseEuroToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function StepPaketi({ listing }: { listing: ListingDTO }) {
  const t = useTranslations("Vendor.packages");
  const tv = useTranslations("Vendor");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [included, setIncluded] = useState("");
  const [error, setError] = useState(false);

  const listQO = trpc.catalog.package.listByListing.queryOptions({ listingId: listing.id });
  const { data: packages } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });

  const create = useMutation(
    trpc.catalog.package.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        setOpen(false);
        setName(""); setPrice(""); setDuration(""); setIncluded("");
      },
      onError: () => setError(true),
    }),
  );
  const remove = useMutation(trpc.catalog.package.remove.mutationOptions({ onSuccess: invalidate, onError: () => setError(true) }));

  // ponytail: без edit в Ф1 — изтрий и създай наново; edit идва ако вендори го поискат
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    const cents = parseEuroToCents(price);
    if (cents === null || cents <= 0) { toast.error(t("priceInvalid")); return; }
    create.mutate({
      listingId: listing.id,
      name: name.trim(),
      priceFromCents: cents,
      ...(duration.trim() ? { duration: duration.trim() } : {}),
      ...(included.trim() ? { included: included.trim() } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("title")}</h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(false); }}>
          <DialogTrigger asChild><Button>{t("add")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("add")}</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="p-name">{t("name")}</Label>
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-price">{t("price")}</Label>
                <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-dur">{t("duration")}</Label>
                <Input id="p-dur" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-inc">{t("included")}</Label>
                <Textarea id="p-inc" rows={4} value={included} onChange={(e) => setIncluded(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{tv("errorSave")}</p>}
              <Button type="submit" className="w-full" disabled={create.isPending}>{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{tv("errorSave")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {packages?.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{p.name}</h3>
                <span className="font-medium tabular-nums">{formatEuro(p.priceFromCents)}</span>
              </div>
              {p.duration && <p className="text-sm text-muted-foreground">{p.duration}</p>}
              {p.included && <p className="whitespace-pre-line text-sm">{p.included}</p>}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setError(false); remove.mutate({ id: p.id }); }}>
                {t("remove")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
