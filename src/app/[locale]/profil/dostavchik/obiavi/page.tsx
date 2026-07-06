import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/data/users/require-user";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListingStatusBadge } from "@/components/vendor/listing-status-badge";
import { ListingActions } from "@/components/vendor/listing-actions";
import { formatEuro } from "@/lib/money";

export default async function MyListingsPage() {
  const t = await getTranslations("Vendor");
  const user = await requireUser();
  const listings = await ListingDAL.for(user).listMine();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">{t("myListings")}</h1>
        <Button asChild>
          <Link href="/profil/dostavchik/obiavi/nova">{t("newListing")}</Link>
        </Button>
      </div>
      {listings.length === 0 ? (
        <p className="text-muted-foreground">{t("noListings")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <Card key={l.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{l.title}</h2>
                  <ListingStatusBadge status={l.status} />
                </div>
                {l.priceFromCents !== null && (
                  <p className="text-sm text-muted-foreground">
                    {t("priceFrom", { price: formatEuro(l.priceFromCents) })}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/profil/dostavchik/obiavi/${l.id}`}>{t("edit")}</Link>
                  </Button>
                  <ListingActions id={l.id} status={l.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
