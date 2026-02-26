import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGOS - Plateforme d'Analyse Geospatiale",
  description: "Plateforme d'analyse geospatiale et de surveillance en temps reel",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ARGOS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#00d4ff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">
        <ServiceWorkerRegistrar />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
