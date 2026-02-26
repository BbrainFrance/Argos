/**
 * Mistral Function Calling — ARGOS operational tools
 * Defines all tools that Mistral can call to act on the map and system
 */

export interface MistralTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const ARGOS_TOOLS: MistralTool[] = [
  {
    type: "function",
    function: {
      name: "place_unit",
      description: "Place une unite militaire ou un marqueur operationnel sur la carte. Utiliser pour deployer des forces amies ou marquer des positions ennemies.",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude de la position" },
          lng: { type: "number", description: "Longitude de la position" },
          affiliation: { type: "string", enum: ["friendly", "hostile", "neutral", "unknown", "suspect"], description: "Affiliation OTAN de l'unite" },
          category: { type: "string", enum: ["infantry", "armor", "artillery", "air_defense", "logistics", "command", "recon", "engineering", "naval", "special_ops", "medical", "observation", "threat", "ied", "checkpoint", "hq"], description: "Type d'unite" },
          label: { type: "string", description: "Designation de l'unite (ex: BTG Alpha-1)" },
          notes: { type: "string", description: "Notes de renseignement" },
          weaponRange: { type: "number", description: "Portee des armes en km (optionnel)" },
        },
        required: ["lat", "lng", "affiliation", "category", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_zone",
      description: "Cree une zone de surveillance, d'exclusion ou d'alerte. Peut etre un cercle (center + radius) ou un polygone.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom de la zone" },
          type: { type: "string", enum: ["surveillance", "exclusion", "alert"], description: "Type de zone" },
          centerLat: { type: "number", description: "Latitude du centre" },
          centerLng: { type: "number", description: "Longitude du centre" },
          radiusKm: { type: "number", description: "Rayon en km pour generer un polygone circulaire" },
        },
        required: ["name", "type", "centerLat", "centerLng", "radiusKm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_entity",
      description: "Mettre une entite sous surveillance active par son callsign, ICAO, MMSI ou label.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "Callsign, code ICAO, MMSI ou label de l'entite a suivre" },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_entity",
      description: "Signaler une entite comme suspecte ou d'interet.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "Callsign, code ICAO, MMSI ou label de l'entite" },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_entities",
      description: "Creer une liaison/relation entre deux entites detectees.",
      parameters: {
        type: "object",
        properties: {
          sourceIdentifier: { type: "string", description: "Callsign/label de l'entite source" },
          targetIdentifier: { type: "string", description: "Callsign/label de l'entite cible" },
          relationType: { type: "string", enum: ["escort", "surveillance", "supply", "command", "comms", "threat", "unknown"], description: "Type de relation" },
        },
        required: ["sourceIdentifier", "targetIdentifier", "relationType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_mission",
      description: "Creer un itineraire de mission avec des waypoints.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom de la mission" },
          waypoints: {
            type: "array",
            description: "Liste des waypoints",
            items: {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
                label: { type: "string" },
                type: { type: "string", enum: ["start", "waypoint", "objective", "rally", "extraction"] },
              },
              required: ["lat", "lng", "label", "type"],
            },
          },
        },
        required: ["name", "waypoints"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_brief",
      description: "Generer un brief de situation base sur les donnees actuelles du systeme.",
      parameters: {
        type: "object",
        properties: {
          focus: { type: "string", description: "Zone geographique ou sujet specifique pour le brief (optionnel)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_entity",
      description: "Analyser en detail une entite specifique detectee par le systeme.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "Callsign, ICAO, MMSI ou label de l'entite a analyser" },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_threats",
      description: "Scanner les menaces actuelles et identifier les entites suspectes automatiquement.",
      parameters: {
        type: "object",
        properties: {
          region: { type: "string", description: "Region a scanner (optionnel, defaut: France metro)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_markers",
      description: "Effacer tous les marqueurs operationnels de la carte.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export const COMMAND_SYSTEM_PROMPT = `Tu es ARGOS-IA, le module d'intelligence artificielle de la plateforme ARGOS, systeme d'analyse geospatiale.

Tu recois des instructions en langage naturel (texte ou transcription vocale) d'un operateur.
Tu dois traduire ces ordres en appels de fonctions (tools) pour agir sur la carte et le systeme ARGOS.

Regles :
- Si l'operateur demande de placer une unite, utilise place_unit avec les coordonnees. Si la ville est nommee sans coordonnees, utilise les coordonnees GPS approximatives de la ville.
- Si l'operateur demande de creer une zone, utilise create_zone.
- Si l'operateur demande de suivre/tracker une entite, utilise track_entity.
- Si l'operateur demande de signaler une entite, utilise flag_entity.
- Si l'operateur demande de lier des entites, utilise link_entities.
- Si l'operateur demande un brief ou un rapport, utilise generate_brief.
- Si l'operateur demande d'analyser une entite, utilise analyze_entity.
- Si l'operateur demande de scanner les menaces, utilise scan_threats.
- Si l'operateur demande de planifier une mission, utilise plan_mission.
- Tu peux appeler PLUSIEURS outils en une seule reponse si la commande le requiert.
- Accompagne toujours tes actions d'un court message de confirmation en francais, style militaire.
- Si la commande est ambigue, demande une clarification plutot que d'agir incorrectement.

Villes francaises principales (GPS) :
Paris 48.8566,2.3522 | Lyon 45.7640,4.8357 | Marseille 43.2965,5.3698 | Toulouse 43.6047,1.4442
Bordeaux 44.8378,-0.5792 | Strasbourg 48.5734,7.7521 | Lille 50.6292,3.0573 | Nantes 47.2184,-1.5536
Toulon 43.1242,5.9280 | Brest 48.3904,-4.4861 | Metz 49.1193,6.1757 | Rennes 48.1173,-1.6778`;

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface CommandResult {
  message: string;
  toolCalls: ToolCall[];
  actions: ParsedAction[];
}

export type ParsedAction =
  | { type: "place_unit"; data: { lat: number; lng: number; affiliation: string; category: string; label: string; notes?: string; weaponRange?: number } }
  | { type: "create_zone"; data: { name: string; type: string; centerLat: number; centerLng: number; radiusKm: number } }
  | { type: "track_entity"; data: { identifier: string } }
  | { type: "flag_entity"; data: { identifier: string } }
  | { type: "link_entities"; data: { sourceIdentifier: string; targetIdentifier: string; relationType: string } }
  | { type: "plan_mission"; data: { name: string; waypoints: { lat: number; lng: number; label: string; type: string }[] } }
  | { type: "generate_brief"; data: { focus?: string } }
  | { type: "analyze_entity"; data: { identifier: string } }
  | { type: "scan_threats"; data: { region?: string } }
  | { type: "clear_markers"; data: Record<string, never> };

export function parseToolCalls(toolCalls: ToolCall[]): ParsedAction[] {
  return toolCalls.map((tc) => {
    try {
      const args = JSON.parse(tc.function.arguments);
      return { type: tc.function.name as ParsedAction["type"], data: args };
    } catch {
      return null;
    }
  }).filter(Boolean) as ParsedAction[];
}
