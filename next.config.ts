import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const mockProjectId = "proj_acme";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: "standalone",
  devIndicators: false,
  async redirects() {
    return [
      {
        source: "/",
        destination: `/projects/${mockProjectId}/features`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
