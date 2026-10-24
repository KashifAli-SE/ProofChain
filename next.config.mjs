/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['unpdf', '@google/genai'],
  },
};

export default nextConfig;
