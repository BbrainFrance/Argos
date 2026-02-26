import { withCircuitBreaker } from "./circuit-breaker";

export interface LLMResponse {
  content: string;
  provider: "mistral" | "ollama" | "local";
  model: string;
  latencyMs: number;
}

const ARGOS_SYSTEM_PROMPT = `Tu es ARGOS-IA, le module d'intelligence artificielle de la plateforme ARGOS, systeme d'analyse geospatiale et de surveillance.

Regles strictes :
- Reponds toujours en francais, de maniere concise, structuree et factuelle
- Structure tes analyses avec des sections claires : SITUATION, ANALYSE, RECOMMANDATIONS
- Fournis des evaluations de menace (NEGLIGEABLE / FAIBLE / MODERE / ELEVE / CRITIQUE)
- Ne fais jamais de suppositions non fondees sur les donnees fournies
- Signale les lacunes dans tes analyses
- Horodatage en format ISO (ex: 2026-02-25T14:30Z)`;

/**
 * Mistral AI — LLM provider (Paris, FR).
 */
async function callMistral(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY non configuree");

  const start = Date.now();
  const res = await withCircuitBreaker("mistral-briefing", () =>
    fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    })
  );

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Mistral API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Reponse Mistral vide");

  return { content, provider: "mistral", model: "mistral-large-latest", latencyMs };
}

/**
 * Ollama — LLM auto-heberge.
 * Les donnees ne quittent jamais l'infrastructure de l'operateur.
 * URL configurable via OLLAMA_BASE_URL (defaut: http://localhost:11434).
 * Modele configurable via OLLAMA_MODEL (defaut: mistral).
 */
async function callOllama(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "mistral";

  const start = Date.now();
  const res = await withCircuitBreaker("ollama", () =>
    fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 },
      }),
    })
  );

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? "";
  if (!content) throw new Error("Reponse Ollama vide");

  return { content, provider: "ollama", model, latencyMs };
}

/**
 * Fallback local — mode degrade, aucun appel externe.
 * Utilise un template structure a partir des donnees brutes.
 */
function localFallback(userPrompt: string): LLMResponse {
  const payload = userPrompt.slice(0, 2000);
  const content = `BRIEF AUTOMATIQUE — MODE DEGRADE
═══════════════════════════════════

SITUATION : Donnees disponibles en mode hors-ligne.
Les services IA (Mistral, Ollama) sont temporairement indisponibles.

DONNEES BRUTES :
${payload}

─────────────────────────────────
NOTE : Ce brief est genere en mode degrade (template local).
Les analyses approfondies necessitent la reconnexion aux services IA.
Classification : NON CLASSIFIE`;

  return {
    content,
    provider: "local",
    model: "template-v1",
    latencyMs: 0,
  };
}

type ProviderFn = (systemPrompt: string, userPrompt: string) => Promise<LLMResponse>;

/**
 * Chaine de fallback :
 * 1. Mistral API (cloud francais, Paris)
 * 2. Ollama (auto-heberge, on-premise)
 * 3. Template local (mode degrade)
 */
const PROVIDERS: { fn: ProviderFn; name: string; check: () => boolean }[] = [
  {
    fn: callMistral,
    name: "Mistral",
    check: () => !!process.env.MISTRAL_API_KEY,
  },
  {
    fn: callOllama,
    name: "Ollama",
    check: () => true, // Ollama est toujours tentable (localhost par defaut)
  },
];

export async function queryLLMChain(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  for (const { fn, name, check } of PROVIDERS) {
    if (!check()) continue;
    try {
      const result = await fn(systemPrompt, userPrompt);
      return result;
    } catch (err) {
      console.warn(`[llm-chain] ${name} indisponible:`, err instanceof Error ? err.message : err);
    }
  }

  return localFallback(userPrompt);
}

export interface AutoBriefingData {
  conflicts?: { country: string; count: number; fatalities: number }[];
  disasters?: { title: string; severity: string }[];
  fires?: number;
  outages?: { country: string; severity: string }[];
  cyberThreats?: number;
  topThreats?: { title: string; level: string; score: number }[];
  instabilityIndex?: { country: string; score: number; level: string }[];
}

export async function generateAutoBriefing(data: AutoBriefingData): Promise<LLMResponse> {
  const userPrompt = `Genere un BRIEF DE SITUATION MONDIAL (World Situation Report) a partir des donnees suivantes :

CONFLITS ACTIFS :
${data.conflicts?.map((c) => `- ${c.country}: ${c.count} evenements, ${c.fatalities} victimes`).join("\n") || "Aucun"}

CATASTROPHES NATURELLES :
${data.disasters?.map((d) => `- [${d.severity.toUpperCase()}] ${d.title}`).join("\n") || "Aucune"}

FEUX DETECTES : ${data.fires ?? 0} hotspots

PANNES INTERNET :
${data.outages?.map((o) => `- ${o.country}: ${o.severity}`).join("\n") || "Aucune"}

CYBER MENACES : ${data.cyberThreats ?? 0} IOCs actifs

MENACES CLASSIFIEES (TOP 5) :
${data.topThreats?.slice(0, 5).map((t) => `- [${t.level}] ${t.title} (score: ${t.score})`).join("\n") || "Aucune"}

INDEX D'INSTABILITE (TOP 10) :
${data.instabilityIndex?.slice(0, 10).map((i) => `- ${i.country}: ${i.score}/100 (${i.level})`).join("\n") || "N/A"}

Structure ton brief en :
1. SYNTHESE EXECUTIVE (3 lignes max)
2. ZONES D'ATTENTION PRIORITAIRE
3. MENACES EMERGENTES
4. RECOMMANDATIONS
5. LACUNES DE RENSEIGNEMENT`;

  return queryLLMChain(ARGOS_SYSTEM_PROMPT, userPrompt);
}
