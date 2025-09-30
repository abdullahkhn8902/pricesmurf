const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || {};
      config.externals['@google-cloud/secret-manager'] =
        'commonjs @google-cloud/secret-manager';
    }
    return config;
  },
};

export default nextConfig;
