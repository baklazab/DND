import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "The Character Ledger", description: "D&D 2024 character manager" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body>{children}</body></html>;
}
