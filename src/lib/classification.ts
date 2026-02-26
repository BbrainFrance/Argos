/**
 * Classification de securite des documents et donnees — ARGOS
 *
 * Niveaux conformes au cadre reglementaire francais (IGI 1300) :
 *   - NP  : Non Protege
 *   - DR  : Diffusion Restreinte
 *   - CD  : Confidentiel Defense
 *   - SD  : Secret Defense
 *   - TSD : Tres Secret Defense
 *
 * Chaque niveau est associe a une couleur, un bandeau d'affichage,
 * et des regles de manipulation.
 */

export type ClassificationLevel = "NP" | "DR" | "CD" | "SD" | "TSD";

export interface ClassificationMeta {
  level: ClassificationLevel;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  textColor: string;
  bannerText: string;
  pdfHeaderColor: [number, number, number];
  pdfTextColor: [number, number, number];
  handlingRules: string[];
  canExport: boolean;
  requiresEncryption: boolean;
  retentionDays: number;
}

const CLASSIFICATIONS: Record<ClassificationLevel, ClassificationMeta> = {
  NP: {
    level: "NP",
    label: "Non Protege",
    shortLabel: "NP",
    color: "#22c55e",
    bgColor: "bg-green-600",
    textColor: "text-white",
    bannerText: "NON PROTEGE",
    pdfHeaderColor: [34, 197, 94],
    pdfTextColor: [255, 255, 255],
    handlingRules: [
      "Diffusion libre au sein du service",
    ],
    canExport: true,
    requiresEncryption: false,
    retentionDays: 365,
  },
  DR: {
    level: "DR",
    label: "Diffusion Restreinte",
    shortLabel: "DR",
    color: "#3b82f6",
    bgColor: "bg-blue-600",
    textColor: "text-white",
    bannerText: "DIFFUSION RESTREINTE — PERSONNEL HABILITE UNIQUEMENT",
    pdfHeaderColor: [59, 130, 246],
    pdfTextColor: [255, 255, 255],
    handlingRules: [
      "Diffusion limitee aux personnes ayant le besoin d'en connaitre",
      "Stockage dans un environnement controle",
      "Marquage obligatoire sur chaque page",
    ],
    canExport: true,
    requiresEncryption: false,
    retentionDays: 365 * 2,
  },
  CD: {
    level: "CD",
    label: "Confidentiel Defense",
    shortLabel: "CD",
    color: "#f59e0b",
    bgColor: "bg-amber-500",
    textColor: "text-black",
    bannerText: "CONFIDENTIEL DEFENSE — ARTICLE 413-9 DU CODE PENAL",
    pdfHeaderColor: [245, 158, 11],
    pdfTextColor: [0, 0, 0],
    handlingRules: [
      "Habilitation Confidentiel Defense requise",
      "Chiffrement obligatoire en transit et au repos",
      "Traçabilite de chaque acces",
      "Destruction controlee avec PV",
    ],
    canExport: true,
    requiresEncryption: true,
    retentionDays: 365 * 5,
  },
  SD: {
    level: "SD",
    label: "Secret Defense",
    shortLabel: "SD",
    color: "#ef4444",
    bgColor: "bg-red-600",
    textColor: "text-white",
    bannerText: "SECRET DEFENSE — ARTICLE 413-9 DU CODE PENAL",
    pdfHeaderColor: [239, 68, 68],
    pdfTextColor: [255, 255, 255],
    handlingRules: [
      "Habilitation Secret Defense requise",
      "Chiffrement AES-256 obligatoire",
      "Traçabilite individuelle de chaque acces",
      "Interdiction de copie sans autorisation du HFDS",
      "Destruction controlee avec PV signe par officier de securite",
    ],
    canExport: false,
    requiresEncryption: true,
    retentionDays: 365 * 10,
  },
  TSD: {
    level: "TSD",
    label: "Tres Secret Defense",
    shortLabel: "TSD",
    color: "#7c3aed",
    bgColor: "bg-purple-700",
    textColor: "text-white",
    bannerText: "TRES SECRET DEFENSE — ALINEA SPECIAL — ARTICLE 413-9 DU CODE PENAL",
    pdfHeaderColor: [124, 58, 237],
    pdfTextColor: [255, 255, 255],
    handlingRules: [
      "Habilitation Tres Secret Defense nominative requise",
      "Acces strictement limite au besoin d'en connaitre",
      "Chiffrement AES-256-GCM obligatoire avec cles dediees",
      "Traçabilite avec horodatage et empreinte biometrique",
      "Interdiction absolue de reproduction",
      "Stockage exclusif dans coffre-fort homologue",
      "Export strictement interdit",
    ],
    canExport: false,
    requiresEncryption: true,
    retentionDays: 365 * 30,
  },
};

export function getClassification(level: ClassificationLevel): ClassificationMeta {
  return CLASSIFICATIONS[level];
}

export function getAllClassifications(): ClassificationMeta[] {
  return Object.values(CLASSIFICATIONS);
}

const LEVEL_ORDER: ClassificationLevel[] = ["NP", "DR", "CD", "SD", "TSD"];

export function compareClassification(a: ClassificationLevel, b: ClassificationLevel): number {
  return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
}

export function isHigherOrEqual(level: ClassificationLevel, required: ClassificationLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(required);
}

export function canUserAccess(userClearance: ClassificationLevel, docLevel: ClassificationLevel): boolean {
  return isHigherOrEqual(userClearance, docLevel);
}

export function canExportAtLevel(level: ClassificationLevel): boolean {
  return CLASSIFICATIONS[level].canExport;
}

export function requiresEncryption(level: ClassificationLevel): boolean {
  return CLASSIFICATIONS[level].requiresEncryption;
}

export function getClassificationBanner(level: ClassificationLevel): string {
  return CLASSIFICATIONS[level].bannerText;
}

export function formatClassificationHeader(level: ClassificationLevel): string {
  const c = CLASSIFICATIONS[level];
  const date = new Date();
  const months = ["JAN", "FEV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOU", "SEP", "OCT", "NOV", "DEC"];
  const timestamp = `${date.getDate().toString().padStart(2, "0")}${months[date.getMonth()]}${date.getFullYear()} ${date.getHours().toString().padStart(2, "0")}${date.getMinutes().toString().padStart(2, "0")}Z`;
  return `${c.bannerText} — ${timestamp}`;
}
