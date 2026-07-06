"use client";
import { useSearchParams } from "next/navigation";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { WizardNav, STEPS, type WizardStep } from "./wizard-nav";

export function WizardShell({
  listing,
  definitions,
}: {
  listing: ListingDTO;
  definitions: AttributeDefinitionDTO[];
}) {
  const searchParams = useSearchParams();
  const raw = searchParams.get("step");
  const step: WizardStep = STEPS.includes(raw as WizardStep) ? (raw as WizardStep) : "osnovni";

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <h1 className="font-serif text-3xl">{listing.title}</h1>
      <WizardNav current={step} listingId={listing.id} position="top" />
      <section>
        {step === "osnovni" && <p className="text-muted-foreground">…</p>}
        {step === "atributi" && <p className="text-muted-foreground">…</p>}
        {step === "galeria" && <p className="text-muted-foreground">…</p>}
        {step === "paketi" && <p className="text-muted-foreground">…</p>}
        {step === "pregled" && <p className="text-muted-foreground">…</p>}
      </section>
      <WizardNav current={step} listingId={listing.id} position="bottom" />
    </main>
  );
}
