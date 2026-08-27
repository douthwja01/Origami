import type { NextConfig } from "next";
import { maxUploadBodyLimitFromEnv } from "./lib/settings/upload-limit-env";

const uploadBodyLimit = maxUploadBodyLimitFromEnv();

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "bcryptjs"],
  transpilePackages: ["three"],
  agentRules: false,
  experimental: {
    proxyClientMaxBodySize: uploadBodyLimit,
    serverActions: {
      bodySizeLimit: uploadBodyLimit,
    },
  },
};

export default nextConfig;
