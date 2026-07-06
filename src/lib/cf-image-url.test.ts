import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

test("строи URL при наличен hash", async () => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH", "hash123");
  const { cfImageUrl } = await import("./cf-image-url");
  expect(cfImageUrl("img-1")).toBe("https://imagedelivery.net/hash123/img-1/public");
  expect(cfImageUrl("img-1", "thumb")).toBe("https://imagedelivery.net/hash123/img-1/thumb");
});

test("null без hash", async () => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH", "");
  const { cfImageUrl } = await import("./cf-image-url");
  expect(cfImageUrl("img-1")).toBeNull();
});
