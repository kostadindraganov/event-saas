import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageWindow } from "@/lib/catalog-search-params";

function buildHref(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "page" || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, v);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export async function CatalogPagination({
  total,
  page,
  perPage,
  basePath,
  searchParams,
}: {
  total: number;
  page: number;
  perPage: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations("Catalog");
  const totalPages = Math.min(50, Math.max(1, Math.ceil(total / perPage)));
  if (totalPages <= 1) return null;

  const linkCls =
    "flex h-11 min-w-11 items-center justify-center rounded-md border border-border px-3 text-sm hover:border-foreground/25";
  const activeCls =
    "flex h-11 min-w-11 items-center justify-center rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background";

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label={t("pagination")}>
      {page > 1 && (
        <Link href={buildHref(basePath, searchParams, page - 1)} className={linkCls}>
          {t("pagePrev")}
        </Link>
      )}
      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(basePath, searchParams, p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? activeCls : linkCls}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={buildHref(basePath, searchParams, page + 1)} className={linkCls}>
          {t("pageNext")}
        </Link>
      )}
    </nav>
  );
}
