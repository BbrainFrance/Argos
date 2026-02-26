"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Identifiants invalides");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-argos-bg grid-overlay relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-argos-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Classification banner */}
        <div className="text-center mb-8">
          <div className="inline-block px-4 py-1 border border-argos-danger/40 rounded-sm mb-6">
            <span className="text-[8px] font-mono text-argos-danger tracking-[0.4em] uppercase">
              Acces Restreint
            </span>
          </div>

          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-8 h-px bg-argos-accent/30" />
            <h1 className="text-2xl font-mono font-semibold text-argos-accent text-glow tracking-[0.3em]">
              ARGOS
            </h1>
            <div className="w-8 h-px bg-argos-accent/30" />
          </div>
          <p className="text-[9px] font-mono text-argos-text-dim tracking-[0.2em] uppercase">
            Plateforme d'Analyse Geospatiale
          </p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 space-y-5"
        >
          <div className="text-center pb-2 border-b border-argos-border/30">
            <span className="text-[9px] font-mono text-argos-text-dim/60 tracking-widest uppercase">
              Authentification Operateur
            </span>
          </div>

          {error && (
            <div className="px-3 py-2 bg-argos-danger/10 border border-argos-danger/30 rounded">
              <p className="text-[10px] font-mono text-argos-danger">{error}</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-mono text-argos-text-dim/60 uppercase tracking-widest">
              Identifiant
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="email@exemple.com"
              className="w-full px-3 py-2.5 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50 focus:ring-1 focus:ring-argos-accent/20 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-mono text-argos-text-dim/60 uppercase tracking-widest">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              className="w-full px-3 py-2.5 bg-argos-bg border border-argos-border/50 rounded text-sm font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-argos-accent/50 focus:ring-1 focus:ring-argos-accent/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-argos-accent/10 border border-argos-accent/40 rounded text-xs font-mono text-argos-accent tracking-widest uppercase hover:bg-argos-accent/20 hover:border-argos-accent/60 focus:outline-none focus:ring-2 focus:ring-argos-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-argos-accent/50 border-t-argos-accent rounded-full animate-spin" />
                Verification...
              </span>
            ) : (
              "Connexion Securisee"
            )}
          </button>

          <div className="text-center pt-2 border-t border-argos-border/20">
            <p className="text-[8px] font-mono text-argos-text-dim/30">
              Acces restreint — Toute tentative non autorisee est enregistree
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-[8px] font-mono text-argos-text-dim/20 tracking-wider">
            ARGOS
          </p>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-argos-accent/10" />
      <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-argos-accent/10" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-argos-accent/10" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-argos-accent/10" />
    </div>
  );
}
