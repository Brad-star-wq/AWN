/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow importing the engine TypeScript source from outside apps/web
    // (it lives at the repo root, imported via the @engine/* alias).
    externalDir: true,
    // Keep the Postgres driver as a runtime dependency, not bundled — it uses
    // node net/tls. It only ever runs server-side.
    serverComponentsExternalPackages: ['postgres'],
  },
};

export default nextConfig;
