/** @type {import('next').NextConfig} */
const nextConfig = {
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
