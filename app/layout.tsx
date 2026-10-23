import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEAC Marketplace — Private Data Center Investment Network",
  description: "Curated data center opportunities for lease, financing and sale.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
