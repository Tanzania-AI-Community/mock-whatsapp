/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
// await import("./src/env.js")

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Already doing linting and typechecking as separate tasks in CI
  // eslint: { ignoreDuringBuilds: true },
  // typescript: { ignoreBuildErrors: true },
  output: "standalone",
  transpilePackages: ["geist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "photos.app.goo.gl",
      },
      {
        protocol: "https",
        hostname: "ibb.co",
      },
      {
        protocol: "https",
        hostname: "i.ibb.co",
      },
    ],
  },
}

export default nextConfig
