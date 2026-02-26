const MISTRAL_API = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "mistral-large-latest";

const SYSTEM_PROMPT = `Tu es ARGOS-IA, le module d'intelligence artificielle de la plateforme ARGOS, systeme souverain francais de renseignement. Tu assistes les analystes du SGDSN, de la DGSE et de la DGSI.

Regles strictes :
- Reponds toujours en francais, style brief militaire (concis, structure, factuel)
- Utilise la terminologie OTAN/militaire francaise quand applicable
- Structure tes briefs avec des sections claires : SITUATION, ANALYSE, RECOMMANDATIONS
- Fournis des evaluations de menace (NEGLIGEABLE / FAIBLE / MODERE / ELEVE / CRITIQUE)
- Ne fais jamais de suppositions non fondees sur les donnees fournies
- Signale les lacunes de renseignement (gaps) dans tes analyses
- Horodatage en format militaire (ex: 25FEV2026 1430Z)`;

import { ARGOS_TOOLS, COMMAND_SYSTEM_PROMPT, ToolCall, parseToolCalls, ParsedAction, MistralTool } from "./mistral-tools";

interface MistralMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export async function queryMistral(userPrompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return "[ERREUR] Cle API Mistral non configuree. Ajoutez MISTRAL_API_KEY dans .env";
  }

  const messages: MistralMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const res = await fetch(MISTRAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return `[ERREUR] Mistral API ${res.status}: ${err.slice(0, 200)}`;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "[ERREUR] Reponse vide";
}

export interface CommandResponse {
  message: string;
  actions: ParsedAction[];
  conversationId: string;
}

const conversationStore = new Map<string, MistralMessage[]>();

export async function executeCommand(
  userCommand: string,
  conversationId: string,
  context?: { entityList?: string; alertSummary?: string; stats?: string }
): Promise<CommandResponse> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return { message: "[ERREUR] Cle API Mistral non configuree", actions: [], conversationId };
  }

  let history = conversationStore.get(conversationId);
  if (!history) {
    let systemContent = COMMAND_SYSTEM_PROMPT;
    if (context) {
      systemContent += "\n\nCONTEXTE TEMPS REEL :";
      if (context.stats) systemContent += `\n${context.stats}`;
      if (context.entityList) systemContent += `\nENTITES DETECTEES :\n${context.entityList}`;
      if (context.alertSummary) systemContent += `\nALERTES :\n${context.alertSummary}`;
    }
    history = [{ role: "system", content: systemContent }];
    conversationStore.set(conversationId, history);
  }

  history.push({ role: "user", content: userCommand });

  if (history.length > 30) {
    const system = history[0];
    history = [system, ...history.slice(-20)];
    conversationStore.set(conversationId, history);
  }

  const res = await fetch(MISTRAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: history,
      tools: ARGOS_TOOLS as MistralTool[],
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { message: `[ERREUR] Mistral API ${res.status}: ${err.slice(0, 200)}`, actions: [], conversationId };
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  if (!choice) {
    return { message: "[ERREUR] Reponse vide", actions: [], conversationId };
  }

  const assistantMessage = choice.message;
  history.push(assistantMessage);

  let actions: ParsedAction[] = [];
  let message = assistantMessage.content ?? "";

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    actions = parseToolCalls(assistantMessage.tool_calls);

    for (const tc of assistantMessage.tool_calls) {
      history.push({
        role: "tool",
        content: JSON.stringify({ status: "executed", tool: tc.function.name }),
        tool_call_id: tc.id,
      });
    }

    if (!message && actions.length > 0) {
      const actionNames = actions.map((a) => a.type).join(", ");
      message = `Recu. Execution de ${actions.length} action(s) : ${actionNames}.`;
    }
  }

  conversationStore.set(conversationId, history);

  return { message, actions, conversationId };
}

export function buildSituationPrompt(stats: {
  totalAircraft: number;
  activeFlights: number;
  totalVessels: number;
  avgAltitude: number;
  avgSpeed: number;
  countriesDetected: string[];
  activeAlerts: number;
  trackedEntities: number;
}, alerts: { title: string; message: string; category: string; type: string }[], analyses: { title: string; description: string; severity: string }[]): string {
  const alertBlock = alerts.length > 0
    ? alerts.slice(0, 10).map((a) => `- [${a.type.toUpperCase()}/${a.category.toUpperCase()}] ${a.title}: ${a.message}`).join("\n")
    : "Aucune alerte active.";

  const analysisBlock = analyses.length > 0
    ? analyses.slice(0, 10).map((a) => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.description}`).join("\n")
    : "Aucune anomalie detectee.";

  return `Genere un BRIEF DE SITUATION pour le commandement a partir des donnees suivantes :

DONNEES TEMPS REEL :
- Aeronefs detectes : ${stats.totalAircraft} (${stats.activeFlights} en vol)
- Navires detectes : ${stats.totalVessels}
- Altitude moyenne : ${stats.avgAltitude} m
- Vitesse moyenne : ${stats.avgSpeed} km/h
- Pays detectes : ${stats.countriesDetected.join(", ") || "N/A"}
- Entites suivies : ${stats.trackedEntities}
- Alertes actives : ${stats.activeAlerts}

ALERTES EN COURS :
${alertBlock}

ANALYSES ALGORITHMIQUES :
${analysisBlock}

Fournis un brief structure en 3 parties : SITUATION GENERALE, POINTS D'ATTENTION, RECOMMANDATIONS OPERATIONNELLES.`;
}

export function buildEntityPrompt(entity: {
  type: string;
  label: string;
  position: { lat: number; lng: number } | null;
  metadata: Record<string, unknown>;
  trail: { lat: number; lng: number }[];
  tracked: boolean;
  flagged: boolean;
}): string {
  const meta = Object.entries(entity.metadata)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const trailInfo = entity.trail.length > 1
    ? `Trajectoire: ${entity.trail.length} points enregistres`
    : "Trajectoire: insuffisante";

  return `Analyse cette entite detectee par le systeme ARGOS :

TYPE : ${entity.type.toUpperCase()}
IDENTIFIANT : ${entity.label}
POSITION : ${entity.position ? `${entity.position.lat.toFixed(4)}N, ${entity.position.lng.toFixed(4)}E` : "Inconnue"}
SUIVI : ${entity.tracked ? "OUI" : "NON"}
SIGNALE : ${entity.flagged ? "OUI" : "NON"}
${trailInfo}

METADONNEES :
${meta}

Fournis : IDENTIFICATION (ce qu'on sait), EVALUATION DE MENACE, CONTEXTE OPERATIONNEL, RECOMMANDATIONS.`;
}
