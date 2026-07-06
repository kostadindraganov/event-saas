"use client";
import { useSearchParams } from "next/navigation";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { WizardNav, STEPS, type WizardStep } from "./wizard-nav";
import { StepOsnovni } from "./step-osnovni";
import { StepAtributi } from "./step-atributi";
import { StepGaleria } from "./step-galeria";
import { StepPaketi } from "./step-paketi";

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
        {step === "osnovni" && <StepOsnovni listing={listing} />}
        {step === "atributi" && <StepAtributi listing={listing} definitions={definitions} />}
        {step === "galeria" && <StepGaleria listing={listing} />}
        {step === "paketi" && <StepPaketi listing={listing} />}
        {step === "pregled" && <p className="text-muted-foreground">…</p>}
      </section>
      <WizardNav current={step} listingId={listing.id} position="bottom" />
    </main>
  );
}
