import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: __dirname },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "imagedelivery.net", pathname: "/**" }],
  },
};

export default withNextIntl(nextConfig);
