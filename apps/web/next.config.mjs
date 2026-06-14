/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared contract package is consumed as TypeScript source.
  transpilePackages: ["@legisnote/shared"],
};

export default nextConfig;
