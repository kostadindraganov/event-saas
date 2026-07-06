import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // ponytail: forces next-intl through Vite's resolver (not Node's native ESM
    // resolver) so the "next/navigation" alias below actually applies to it.
    server: { deps: { inline: [/next-intl/] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
      // ponytail: this Next.js build's package.json has no "exports" map, so Node's
      // ESM resolver can't find extensionless "next/navigation" (needed by
      // next-intl/navigation). Point straight at the real file; drop if a future
      // Next/next-intl upgrade restores the exports map.
      "next/navigation": path.resolve(__dirname, "./node_modules/next/navigation.js"),
    },
  },
});
