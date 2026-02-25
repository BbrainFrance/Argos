import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARGOS - Plateforme de Renseignement Souveraine",
  description: "Intelligence spatiale et analyse en temps reel - Souverainete francaise",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
