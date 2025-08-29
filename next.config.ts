import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // The 'instrumentationHook' is no longer needed here in Next.js 15
  // The instrumentation.ts file will be automatically detected and run.

  webpack: (config, { isServer }) => {
    // Only apply this configuration on the server side
    if (isServer) {
      config.externals = config.externals || {};
      // List the modules that should be externalized
      config.externals['@google-cloud/secret-manager'] = 'commonjs @google-cloud/secret-manager';
    }
    return config;
  },
};

export default nextConfig;
