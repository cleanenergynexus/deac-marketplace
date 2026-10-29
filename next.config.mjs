/** @type {import('next').NextConfig} */
const nextConfig = {
  // Project import uploads deal PDFs through a server action (Vercel caps request bodies at 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // Document Wizard PowerPoint export: load pptxgenjs from node_modules instead of bundling it.
  serverExternalPackages: ["pptxgenjs"],
  async headers() {
    // Only the public /embed pages may be framed (by deacna.com).
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://deacna.com https://*.deacna.com" }],
      },
      {
        source: "/((?!embed).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};
export default nextConfig;
