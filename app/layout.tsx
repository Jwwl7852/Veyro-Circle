import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const viewport: Viewport = { width: "device-width", initialScale: 1, userScalable: true };

export const metadata: Metadata = {
  title: "Veyro Circle — lån, lej og del lokalt",
  description: "Lån, lej og del ting i nærheden. Søg i Danmark og Sverige med en valgfri radius.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/veyro-circle-192.png",
    shortcut: "/icons/veyro-circle-192.png",
    apple: "/icons/veyro-circle-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body className="antialiased">{children}<PwaRegister /></body>
    </html>
  );
}
