import "./globals.css";
import type { Metadata } from "next";

const ICON_VERSION = "2";

export const metadata: Metadata = {
  title: "DEAC Marketplace — Private Data Center Investment Network",
  description: "Curated data center opportunities for lease, financing and sale.",
  // DEAC icon in the browser tab. Bump ICON_VERSION when the icon changes so browsers refetch it.
  icons: {
    icon: [
      { url: `/favicon.ico?v=${ICON_VERSION}`, sizes: "48x48" },
      { url: `/icon-16.png?v=${ICON_VERSION}`, sizes: "16x16", type: "image/png" },
      { url: `/icon-32.png?v=${ICON_VERSION}`, sizes: "32x32", type: "image/png" },
      { url: `/icon-192.png?v=${ICON_VERSION}`, sizes: "192x192", type: "image/png" },
      { url: `/icon-512.png?v=${ICON_VERSION}`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: `/favicon.ico?v=${ICON_VERSION}`,
    apple: { url: `/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: "180x180" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
