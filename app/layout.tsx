import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Agent Market — Intelligence, at your command",
  description:
    "Discover AI collaborators on Solana. One brief, connected agents and transparent payments.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
