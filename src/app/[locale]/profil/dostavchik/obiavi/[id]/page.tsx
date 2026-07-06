import { notFound } from "next/navigation";
import { requireUser } from "@/data/users/require-user";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { AttributeDAL } from "@/data/catalog/attribute.dal";
import { WizardShell } from "@/components/vendor/wizard/wizard-shell";

export default async function ListingWizardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  let listing;
  try {
    listing = await ListingDAL.for(user).getForOwner(id);
  } catch {
    notFound();
  }
  const definitions = await AttributeDAL.public().definitionsByCategory(listing.categoryId);
  return <WizardShell listing={listing} definitions={definitions} />;
}
