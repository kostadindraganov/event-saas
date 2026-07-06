// Клиентски helper — NEXT_PUBLIC env се инлайнва при build
export function cfImageUrl(cfImageId: string, variant = "public"): string | null {
  const hash = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH;
  if (!hash) return null;
  return `https://imagedelivery.net/${hash}/${cfImageId}/${variant}`;
}
