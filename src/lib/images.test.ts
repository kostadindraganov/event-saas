import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubEnv() {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc123");
  vi.stubEnv("CLOUDFLARE_IMAGES_API_TOKEN", "tok123");
  vi.stubEnv("CLOUDFLARE_IMAGES_ACCOUNT_HASH", "hash123");
}

test("requestDirectUpload вика CF API и връща id+url", async () => {
  stubEnv();
  const { requestDirectUpload } = await import("./images");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ success: true, result: { id: "img-1", uploadURL: "https://upload.example" } })),
  ));
  const res = await requestDirectUpload();
  expect(res).toEqual({ cfImageId: "img-1", uploadURL: "https://upload.example" });
  const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect(String(call[0])).toContain("/accounts/acc123/images/v2/direct_upload");
});

test("хвърля CF_NOT_CONFIGURED без env", async () => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
  const { requestDirectUpload } = await import("./images");
  await expect(requestDirectUpload()).rejects.toThrow("CF_NOT_CONFIGURED");
});

test("imageUrl строи delivery URL", async () => {
  stubEnv();
  const { imageUrl } = await import("./images");
  expect(imageUrl("img-1", "card")).toBe("https://imagedelivery.net/hash123/img-1/card");
});
