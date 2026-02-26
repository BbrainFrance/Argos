/**
 * NATO APP-6 Military Symbology — simplified SVG generation
 * Standard: MIL-STD-2525D / APP-6(D)
 *
 * Frame shapes:
 *   - Friendly (blue): rectangle
 *   - Hostile (red): diamond
 *   - Neutral (green): square
 *   - Unknown (yellow): quatrefoil/clover
 *
 * Affiliation colors (standard):
 *   - Friendly: #80c0ff
 *   - Hostile: #ff8080
 *   - Neutral: #80ff80
 *   - Unknown: #ffff80
 */

export type Affiliation = "friendly" | "hostile" | "neutral" | "unknown" | "suspect";
export type SymbolDomain = "air" | "sea" | "land" | "subsurface" | "infrastructure";

export interface NATOSymbolOptions {
  affiliation: Affiliation;
  domain: SymbolDomain;
  size: number;
  heading?: number;
  selected?: boolean;
  tracked?: boolean;
  flagged?: boolean;
  modifier?: string;
}

const COLORS: Record<Affiliation, { fill: string; stroke: string; glow: string }> = {
  friendly: { fill: "#80c0ff", stroke: "#4080c0", glow: "#80c0ff" },
  hostile:  { fill: "#ff8080", stroke: "#c04040", glow: "#ff4040" },
  neutral:  { fill: "#80e080", stroke: "#40a040", glow: "#80ff80" },
  unknown:  { fill: "#ffff80", stroke: "#c0c040", glow: "#ffff40" },
  suspect:  { fill: "#ffb060", stroke: "#c08030", glow: "#ff8000" },
};

function airFrame(w: number, h: number, color: string, stroke: string): string {
  const cx = w / 2, top = 2, bot = h - 2;
  const wing = w / 2 - 2;
  return `<path d="M${cx},${top} L${cx + wing},${bot * 0.6} L${cx + wing * 0.3},${bot} L${cx - wing * 0.3},${bot} L${cx - wing},${bot * 0.6} Z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
}

function seaFrame(w: number, h: number, color: string, stroke: string): string {
  const cx = w / 2, cy = h / 2;
  const rx = w / 2 - 2, ry = h / 2 - 2;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>
    <line x1="${cx}" y1="${cy - ry + 1}" x2="${cx}" y2="${cy + ry - 1}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>`;
}

function landFrame(w: number, h: number, color: string, stroke: string, hostile: boolean): string {
  if (hostile) {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2;
    return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="1" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
}

function infraFrame(w: number, h: number, color: string, stroke: string): string {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2;
  return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
}

function modifierText(w: number, h: number, text: string, stroke: string): string {
  if (!text) return "";
  return `<text x="${w / 2}" y="${h / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="${stroke}" font-family="monospace" font-size="${Math.max(7, h * 0.35)}px" font-weight="bold">${text}</text>`;
}

function generateFrame(opts: NATOSymbolOptions): string {
  const { affiliation, domain, size } = opts;
  const c = COLORS[affiliation];
  const w = size, h = size;

  switch (domain) {
    case "air":
      return airFrame(w, h, c.fill, c.stroke);
    case "sea":
    case "subsurface":
      return seaFrame(w, h, c.fill, c.stroke);
    case "land":
      return landFrame(w, h, c.fill, c.stroke, affiliation === "hostile" || affiliation === "suspect");
    case "infrastructure":
      return infraFrame(w, h, c.fill, c.stroke);
    default:
      return seaFrame(w, h, c.fill, c.stroke);
  }
}

export function generateNATOSymbol(opts: NATOSymbolOptions): string {
  const { size, heading, selected, tracked, flagged, modifier, affiliation } = opts;
  const c = COLORS[affiliation];
  const w = size, h = size;

  let selectedOutline = "";
  if (selected) {
    selectedOutline = `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 2"/>`;
  }

  let trackedIndicator = "";
  if (tracked) {
    trackedIndicator = `<circle cx="${w - 2}" cy="2" r="3" fill="#f59e0b" stroke="#000" stroke-width="0.5"/>`;
  }

  let flaggedIndicator = "";
  if (flagged) {
    flaggedIndicator = `<circle cx="${w - 2}" cy="${h - 2}" r="3" fill="#ef4444" stroke="#000" stroke-width="0.5"/>`;
  }

  const glowFilter = `<defs><filter id="g"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

  const frame = generateFrame(opts);
  const mod = modifierText(w, h, modifier ?? "", c.stroke);
  const rot = heading != null ? `transform="rotate(${heading}, ${w / 2}, ${h / 2})"` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${glowFilter}
    <g filter="url(#g)" style="filter:drop-shadow(0 0 ${selected ? 8 : 4}px ${c.glow}80)" ${rot}>
      ${frame}
      ${mod}
    </g>
    ${selectedOutline}
    ${trackedIndicator}
    ${flaggedIndicator}
  </svg>`;
}

export function getAircraftAffiliation(country: string, squawk: string | null): Affiliation {
  const NATO_COUNTRIES = [
    "france", "united states", "united kingdom", "germany", "italy", "spain",
    "canada", "turkey", "poland", "belgium", "netherlands", "kingdom of the netherlands",
    "norway", "denmark", "portugal", "czech republic", "greece", "hungary",
    "romania", "bulgaria", "croatia", "albania", "montenegro", "north macedonia",
    "slovenia", "slovakia", "latvia", "lithuania", "estonia", "finland", "sweden",
    "luxembourg", "iceland",
  ];

  const HOSTILE_INDICATORS = ["russia", "iran", "north korea", "syria", "belarus"];

  if (squawk === "7700" || squawk === "7600" || squawk === "7500") return "hostile";

  const lower = country.toLowerCase();
  if (NATO_COUNTRIES.some((c) => lower.includes(c))) return "friendly";
  if (HOSTILE_INDICATORS.some((c) => lower.includes(c))) return "hostile";

  return "neutral";
}

export function getAircraftModifier(callsign: string | null, squawk: string | null): string {
  if (squawk === "7700") return "EM";
  if (squawk === "7600") return "CF";
  if (squawk === "7500") return "HJ";

  if (!callsign) return "";
  if (callsign.startsWith("CTM") || callsign.startsWith("FAF") || callsign.startsWith("FNY")) return "MIL";
  if (callsign.startsWith("GAM") || callsign.startsWith("COTAM")) return "MIL";
  if (callsign.startsWith("RFR") || callsign.startsWith("FAB")) return "MIL";
  if (callsign.startsWith("RRR") || callsign.startsWith("RAF")) return "MIL";
  if (callsign.startsWith("MMF") || callsign.startsWith("IAM")) return "MIL";
  if (callsign.startsWith("GAF") || callsign.startsWith("SAM")) return "MIL";
  if (callsign.startsWith("SAR")) return "SAR";
  if (callsign.startsWith("SAMU") || callsign.startsWith("DRAG")) return "MED";
  return "";
}

export function getVesselAffiliation(flag: string | null, shipType: string | null): Affiliation {
  if (!flag) return "unknown";
  const lower = flag.toLowerCase();
  if (["fr", "us", "gb", "de", "it", "es"].some((c) => lower.includes(c))) return "friendly";
  if (["ru", "ir", "kp", "sy"].some((c) => lower.includes(c))) return "hostile";
  return "neutral";
}

export function getVesselModifier(shipType: string | null): string {
  if (!shipType) return "";
  const t = shipType.toLowerCase();
  if (t.includes("cargo")) return "CG";
  if (t.includes("tanker")) return "TK";
  if (t.includes("passenger")) return "PX";
  if (t.includes("fishing")) return "FG";
  if (t.includes("high speed")) return "HS";
  if (t.includes("special")) return "SP";
  return "";
}
