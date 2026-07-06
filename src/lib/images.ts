// БЕЗ "server-only" тук — vitest тества модула директно;
// server-only guard-ът се налага от единствения консуматор (media.dal.ts)

const API = "https://api.cloudflare.com/client/v4";

function cfEnv() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
  if (!accountId || !token) throw new Error("CF_NOT_CONFIGURED");
  return { accountId, token };
}

export async function requestDirectUpload(): Promise<{ cfImageId: string; uploadURL: string }> {
  const { accountId, token } = cfEnv();
  const res = await fetch(`${API}/accounts/${accountId}/images/v2/direct_upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { success: boolean; result?: { id: string; uploadURL: string } };
  if (!res.ok || !body.success || !body.result) throw new Error("CF_UPLOAD_REQUEST_FAILED");
  return { cfImageId: body.result.id, uploadURL: body.result.uploadURL };
}

export async function deleteImage(cfImageId: string): Promise<void> {
  const { accountId, token } = cfEnv();
  const res = await fetch(`${API}/accounts/${accountId}/images/v1/${cfImageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // ponytail: 404 при вече изтрита снимка е ок — не хвърляме
  if (!res.ok && res.status !== 404) throw new Error("CF_DELETE_FAILED");
}

export type ImageVariant = "thumb" | "card" | "gallery" | "cover" | "public";

export function imageUrl(cfImageId: string, variant: ImageVariant): string {
  const hash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  if (!hash) throw new Error("CF_NOT_CONFIGURED");
  return `https://imagedelivery.net/${hash}/${cfImageId}/${variant}`;
}
