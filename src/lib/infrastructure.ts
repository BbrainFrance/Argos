import { Infrastructure } from "@/types";

export const FRANCE_INFRASTRUCTURE: Infrastructure[] = [
  // Bases militaires (donnees publiques OpenStreetMap)
  { id: "inf-ba-istres", type: "infrastructure", label: "BA 125 Istres", position: { lat: 43.5237, lng: 4.9284, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 125 Istres-Le Tube", operator: "Armee de l'Air", status: "active", importance: "critical" } },
  { id: "inf-ba-evreux", type: "infrastructure", label: "BA 105 Evreux", position: { lat: 49.0286, lng: 1.2198, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 105 Evreux-Fauville", operator: "Armee de l'Air", status: "active", importance: "critical" } },
  { id: "inf-ba-saint-dizier", type: "infrastructure", label: "BA 113 Saint-Dizier", position: { lat: 48.6361, lng: 4.8994, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 113 Saint-Dizier-Robinson", operator: "Armee de l'Air", status: "active", importance: "critical" } },
  { id: "inf-ba-mont-de-marsan", type: "infrastructure", label: "BA 118 Mont-de-Marsan", position: { lat: 43.9117, lng: -0.5075, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 118 Mont-de-Marsan", operator: "Armee de l'Air", status: "active", importance: "critical" } },
  { id: "inf-ba-avord", type: "infrastructure", label: "BA 702 Avord", position: { lat: 47.0533, lng: 2.6325, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 702 Avord", operator: "Armee de l'Air", status: "active", importance: "critical" } },
  { id: "inf-ba-luxeuil", type: "infrastructure", label: "BA 116 Luxeuil", position: { lat: 47.7833, lng: 6.3642, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base aerienne 116 Luxeuil-Saint Sauveur", operator: "Armee de l'Air", status: "active", importance: "high" } },
  { id: "inf-bn-toulon", type: "infrastructure", label: "Base Navale Toulon", position: { lat: 43.1039, lng: 5.9325, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base navale de Toulon", operator: "Marine Nationale", status: "active", importance: "critical" } },
  { id: "inf-bn-brest", type: "infrastructure", label: "Base Navale Brest", position: { lat: 48.3833, lng: -4.495, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base navale de Brest", operator: "Marine Nationale", status: "active", importance: "critical" } },
  { id: "inf-bn-cherbourg", type: "infrastructure", label: "Base Navale Cherbourg", position: { lat: 49.6392, lng: -1.6164, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "military_base", name: "Base navale de Cherbourg", operator: "Marine Nationale", status: "active", importance: "high" } },

  // Centrales nucleaires
  { id: "inf-nuc-gravelines", type: "infrastructure", label: "Centrale Gravelines", position: { lat: 51.0150, lng: 2.1075, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire de Gravelines", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-cattenom", type: "infrastructure", label: "Centrale Cattenom", position: { lat: 49.4064, lng: 6.2181, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire de Cattenom", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-paluel", type: "infrastructure", label: "Centrale Paluel", position: { lat: 49.8589, lng: 0.6331, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire de Paluel", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-flamanville", type: "infrastructure", label: "Centrale Flamanville", position: { lat: 49.5375, lng: -1.8814, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire de Flamanville", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-la-hague", type: "infrastructure", label: "Usine La Hague", position: { lat: 49.6783, lng: -1.8806, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Usine de retraitement de La Hague", operator: "Orano", status: "active", importance: "critical" } },
  { id: "inf-nuc-tricastin", type: "infrastructure", label: "Centrale Tricastin", position: { lat: 44.3325, lng: 4.7317, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire du Tricastin", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-bugey", type: "infrastructure", label: "Centrale Bugey", position: { lat: 45.7983, lng: 5.2706, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire du Bugey", operator: "EDF", status: "active", importance: "critical" } },
  { id: "inf-nuc-fessenheim", type: "infrastructure", label: "Centrale Fessenheim", position: { lat: 47.9083, lng: 7.5625, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "nuclear_plant", name: "Centrale nucleaire de Fessenheim", operator: "EDF", status: "decommissioned", importance: "medium" } },

  // Aeroports principaux
  { id: "inf-apt-cdg", type: "infrastructure", label: "CDG Paris", position: { lat: 49.0097, lng: 2.5479, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Paris-Charles de Gaulle", operator: "ADP", status: "active", importance: "critical" } },
  { id: "inf-apt-orly", type: "infrastructure", label: "Orly Paris", position: { lat: 48.7262, lng: 2.3652, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Paris-Orly", operator: "ADP", status: "active", importance: "critical" } },
  { id: "inf-apt-nice", type: "infrastructure", label: "Nice Cote d'Azur", position: { lat: 43.6584, lng: 7.2159, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Nice Cote d'Azur", operator: "ACA", status: "active", importance: "high" } },
  { id: "inf-apt-lyon", type: "infrastructure", label: "Lyon Saint-Exupery", position: { lat: 45.7256, lng: 5.0811, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Lyon-Saint Exupery", operator: "VINCI", status: "active", importance: "high" } },
  { id: "inf-apt-marseille", type: "infrastructure", label: "Marseille Provence", position: { lat: 43.4393, lng: 5.2214, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Marseille Provence", operator: "AMP", status: "active", importance: "high" } },
  { id: "inf-apt-toulouse", type: "infrastructure", label: "Toulouse-Blagnac", position: { lat: 43.6294, lng: 1.3678, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "airport", name: "Aeroport Toulouse-Blagnac", operator: "ATB", status: "active", importance: "high" } },

  // Sites gouvernementaux (donnees publiques)
  { id: "inf-gov-elysee", type: "infrastructure", label: "Palais de l'Elysee", position: { lat: 48.8704, lng: 2.3167, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "government", name: "Palais de l'Elysee", operator: "Public", status: "active", importance: "critical" } },
  { id: "inf-gov-matignon", type: "infrastructure", label: "Hotel Matignon", position: { lat: 48.8556, lng: 2.3200, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "government", name: "Hotel de Matignon", operator: "Public", status: "active", importance: "critical" } },

  { id: "inf-gov-dgse", type: "infrastructure", label: "DGSE (Tourelles)", position: { lat: 48.8156, lng: 2.4075, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "government", name: "DGSE - Boulevard Mortier", operator: "Public", status: "active", importance: "critical" } },
  { id: "inf-gov-dgsi", type: "infrastructure", label: "DGSI (Levallois)", position: { lat: 48.8947, lng: 2.2833, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "government", name: "DGSI - Levallois-Perret", operator: "Public", status: "active", importance: "critical" } },

  // Ports maritimes
  { id: "inf-port-marseille", type: "infrastructure", label: "Port Marseille-Fos", position: { lat: 43.3280, lng: 5.0517, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "port", name: "Grand Port Maritime de Marseille", operator: "GPMM", status: "active", importance: "critical" } },
  { id: "inf-port-le-havre", type: "infrastructure", label: "Port Le Havre", position: { lat: 49.4822, lng: 0.1078, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "port", name: "Grand Port Maritime du Havre", operator: "HAROPA", status: "active", importance: "critical" } },
  { id: "inf-port-dunkerque", type: "infrastructure", label: "Port Dunkerque", position: { lat: 51.0486, lng: 2.3336, timestamp: 0 }, trail: [], tracked: false, flagged: false, metadata: { category: "port", name: "Grand Port Maritime de Dunkerque", operator: "GPMD", status: "active", importance: "high" } },
];

export function getInfrastructureByCategory(category?: string): Infrastructure[] {
  if (!category) return FRANCE_INFRASTRUCTURE;
  return FRANCE_INFRASTRUCTURE.filter((i) => i.metadata.category === category);
}

export const INFRA_ICONS: Record<string, { icon: string; color: string }> = {
  military_base: { icon: "⚔", color: "#ef4444" },
  airport: { icon: "✈", color: "#3b82f6" },
  nuclear_plant: { icon: "☢", color: "#f59e0b" },
  port: { icon: "⚓", color: "#10b981" },
  government: { icon: "🏛", color: "#8b5cf6" },
  energy: { icon: "⚡", color: "#f97316" },
  telecom: { icon: "📡", color: "#06b6d4" },
};
