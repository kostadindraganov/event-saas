export type PinLinkMode = "query" | "route";

export function cityPinHref(args: {
  mode: PinLinkMode;
  pin: { cityId: string; slug: string };
  categorySlug: string;
  currentParams: URLSearchParams;
}): string {
  const { mode, pin, categorySlug, currentParams } = args;
  if (mode === "route") return `/${categorySlug}/${pin.slug}`;
  const params = new URLSearchParams(currentParams.toString());
  params.set("city", pin.cityId);
  params.delete("page");
  params.delete("view");
  const qs = params.toString();
  return qs ? `/${categorySlug}?${qs}` : `/${categorySlug}`;
}
