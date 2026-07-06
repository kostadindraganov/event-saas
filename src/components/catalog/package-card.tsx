import { formatEuro } from "@/lib/money";
import type { PublicPackageDTO } from "@/data/catalog/public.dto";

export function PackageCard({ pkg }: { pkg: PublicPackageDTO }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-lg">{pkg.name}</h3>
        <span className="shrink-0 font-medium tabular-nums">{formatEuro(pkg.priceCents)}</span>
      </div>
      {pkg.duration && <p className="mt-1 text-sm text-muted-foreground">{pkg.duration}</p>}
      {pkg.included && <p className="mt-2 whitespace-pre-line text-sm">{pkg.included}</p>}
    </div>
  );
}
