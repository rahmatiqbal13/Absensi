import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Clock-in posts a selfie. The client compresses it (~150–400 KB), but an
      // uncompressed fallback from an older phone can still be a few MB; the 1 MB
      // default rejected those before our code ran. Kept under the ~4.5 MB
      // request cap of serverless hosting.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
