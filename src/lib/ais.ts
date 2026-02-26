import WebSocket from "ws";
import { Vessel, GeoPosition } from "@/types";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

const OPS_BBOXES: [number, number][][] = [
  [
    [
      parseFloat(process.env.OPERATION_BBOX_LAMAX || "51.2"),
      parseFloat(process.env.OPERATION_BBOX_LOMIN || "-5.5"),
    ],
    [
      parseFloat(process.env.OPERATION_BBOX_LAMIN || "41.3"),
      parseFloat(process.env.OPERATION_BBOX_LOMAX || "9.6"),
    ],
  ],
];

const VESSEL_EXPIRY_MS = 30 * 60 * 1000;
const RECONNECT_DELAY_MS = 30_000;
const MIN_CONNECT_INTERVAL_MS = 15_000;

interface AISState {
  vesselCache: Map<string, Vessel>;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingInterval: ReturnType<typeof setInterval> | null;
  lastAttempt: number;
  connecting: boolean;
  messageCount: number;
}

const g = globalThis as unknown as { __ais?: AISState };

function state(): AISState {
  if (!g.__ais) {
    g.__ais = {
      vesselCache: new Map(),
      ws: null,
      reconnectTimer: null,
      pingInterval: null,
      lastAttempt: 0,
      connecting: false,
      messageCount: 0,
    };
  }
  return g.__ais;
}

function getApiKey(): string | null {
  return process.env.AISSTREAM_API_KEY ?? null;
}

function parsePositionReport(msg: Record<string, unknown>): Partial<Vessel> | null {
  const meta = msg.MetaData as Record<string, unknown> | undefined;
  const message = msg.Message as Record<string, Record<string, unknown>> | undefined;
  if (!meta || !message) return null;

  const report = message.PositionReport;
  if (!report) return null;

  const mmsi = String(meta.MMSI ?? report.UserID ?? "");
  if (!mmsi) return null;

  const lat = (report.Latitude ?? meta.latitude) as number;
  const lng = (report.Longitude ?? meta.longitude) as number;
  if (lat === undefined || lng === undefined) return null;
  if (lat === 91 || lng === 181) return null;

  const now = Date.now();
  const position: GeoPosition = { lat, lng, timestamp: now };

  return {
    id: `vs-${mmsi}`,
    type: "vessel",
    label: ((meta.ShipName as string) ?? mmsi).trim() || mmsi,
    position,
    metadata: {
      mmsi,
      name: ((meta.ShipName as string) ?? "").trim() || null,
      shipType: null,
      flag: null,
      speed: (report.Sog as number) ?? null,
      course: (report.Cog as number) ?? null,
      heading: (report.TrueHeading as number) ?? null,
      destination: null,
      draught: null,
      length: null,
    },
  };
}

function parseStaticData(msg: Record<string, unknown>): Partial<Vessel> | null {
  const meta = msg.MetaData as Record<string, unknown> | undefined;
  const message = msg.Message as Record<string, Record<string, unknown>> | undefined;
  if (!meta || !message) return null;

  const report = message.ShipStaticData;
  if (!report) return null;

  const mmsi = String(meta.MMSI ?? report.UserID ?? "");
  if (!mmsi) return null;

  const dimension = report.Dimension as Record<string, number> | undefined;
  const length = dimension ? (dimension.A ?? 0) + (dimension.B ?? 0) : null;

  return {
    id: `vs-${mmsi}`,
    metadata: {
      mmsi,
      name: ((report.Name as string) ?? (meta.ShipName as string) ?? "").trim() || null,
      shipType: mapShipType(report.Type as number),
      flag: null,
      speed: null,
      course: null,
      heading: null,
      destination: ((report.Destination as string) ?? "").trim() || null,
      draught: (report.MaximumStaticDraught as number) ?? null,
      length: length && length > 0 ? length : null,
    },
  };
}

function parseClassBPosition(msg: Record<string, unknown>): Partial<Vessel> | null {
  const meta = msg.MetaData as Record<string, unknown> | undefined;
  const message = msg.Message as Record<string, Record<string, unknown>> | undefined;
  if (!meta || !message) return null;

  const report = message.StandardClassBPositionReport;
  if (!report) return null;

  const mmsi = String(meta.MMSI ?? report.UserID ?? "");
  if (!mmsi) return null;

  const lat = (report.Latitude ?? meta.latitude) as number;
  const lng = (report.Longitude ?? meta.longitude) as number;
  if (lat === undefined || lng === undefined) return null;
  if (lat === 91 || lng === 181) return null;

  const now = Date.now();
  const position: GeoPosition = { lat, lng, timestamp: now };

  return {
    id: `vs-${mmsi}`,
    type: "vessel",
    label: ((meta.ShipName as string) ?? mmsi).trim() || mmsi,
    position,
    metadata: {
      mmsi,
      name: ((meta.ShipName as string) ?? "").trim() || null,
      shipType: null,
      flag: null,
      speed: (report.Sog as number) ?? null,
      course: (report.Cog as number) ?? null,
      heading: (report.TrueHeading as number) ?? null,
      destination: null,
      draught: null,
      length: null,
    },
  };
}

function mapShipType(typeCode: number | undefined): string | null {
  if (!typeCode) return null;
  if (typeCode >= 70 && typeCode <= 79) return "Cargo";
  if (typeCode >= 80 && typeCode <= 89) return "Tanker";
  if (typeCode >= 60 && typeCode <= 69) return "Passenger";
  if (typeCode >= 40 && typeCode <= 49) return "High Speed Craft";
  if (typeCode >= 30 && typeCode <= 39) return "Fishing";
  if (typeCode >= 50 && typeCode <= 59) return "Special Craft";
  if (typeCode >= 20 && typeCode <= 29) return "WIG";
  if (typeCode === 0) return null;
  return `Type ${typeCode}`;
}

function mergeVesselData(existing: Vessel | undefined, update: Partial<Vessel>): Vessel {
  if (!existing) {
    return {
      id: update.id!,
      type: "vessel",
      label: update.label ?? update.metadata?.mmsi ?? "Unknown",
      position: update.position ?? null,
      trail: update.position ? [update.position] : [],
      tracked: false,
      flagged: false,
      metadata: {
        mmsi: update.metadata?.mmsi ?? "",
        name: update.metadata?.name ?? null,
        shipType: update.metadata?.shipType ?? null,
        flag: update.metadata?.flag ?? null,
        speed: update.metadata?.speed ?? null,
        course: update.metadata?.course ?? null,
        heading: update.metadata?.heading ?? null,
        destination: update.metadata?.destination ?? null,
        draught: update.metadata?.draught ?? null,
        length: update.metadata?.length ?? null,
      },
    };
  }

  const merged = { ...existing };

  if (update.position) {
    merged.position = update.position;
    const trail = [...merged.trail];
    const last = trail[trail.length - 1];
    if (!last || last.lat !== update.position.lat || last.lng !== update.position.lng) {
      trail.push(update.position);
    }
    if (trail.length > 30) trail.splice(0, trail.length - 30);
    merged.trail = trail;
  }

  if (update.label && update.label !== update.metadata?.mmsi) {
    merged.label = update.label;
  }

  if (update.metadata) {
    const m = merged.metadata;
    const u = update.metadata;
    merged.metadata = {
      mmsi: m.mmsi,
      name: u.name ?? m.name,
      shipType: u.shipType ?? m.shipType,
      flag: u.flag ?? m.flag,
      speed: u.speed ?? m.speed,
      course: u.course ?? m.course,
      heading: u.heading ?? m.heading,
      destination: u.destination ?? m.destination,
      draught: u.draught ?? m.draught,
      length: u.length ?? m.length,
    };
  }

  return merged;
}

function handleMessage(data: string) {
  try {
    const msg = JSON.parse(data) as Record<string, unknown>;
    const msgType = msg.MessageType as string;

    let update: Partial<Vessel> | null = null;

    if (msgType === "PositionReport") {
      update = parsePositionReport(msg);
    } else if (msgType === "ShipStaticData") {
      update = parseStaticData(msg);
    } else if (msgType === "StandardClassBPositionReport") {
      update = parseClassBPosition(msg);
    }

    if (update?.id) {
      const s = state();
      const existing = s.vesselCache.get(update.id);
      const merged = mergeVesselData(existing, update);
      s.vesselCache.set(update.id, merged);
    }
  } catch {
    // silently ignore malformed messages
  }
}

function cleanExpiredVessels() {
  const s = state();
  const now = Date.now();
  for (const [id, vessel] of s.vesselCache) {
    if (vessel.position && now - vessel.position.timestamp > VESSEL_EXPIRY_MS) {
      s.vesselCache.delete(id);
    }
  }
}

function closeExisting() {
  const s = state();
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }
  if (s.pingInterval) {
    clearInterval(s.pingInterval);
    s.pingInterval = null;
  }
  if (s.ws) {
    try {
      s.ws.removeAllListeners();
      s.ws.close();
    } catch { /* ignore */ }
    s.ws = null;
  }
  s.connecting = false;
}

function connect() {
  const s = state();
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("AIS: AISSTREAM_API_KEY not set — maritime layer disabled");
    return;
  }

  const now = Date.now();
  if (now - s.lastAttempt < MIN_CONNECT_INTERVAL_MS) return;
  if (s.connecting) return;

  closeExisting();
  s.lastAttempt = now;
  s.connecting = true;

  console.log("AIS: Connecting to AISstream.io...");
  const ws = new WebSocket(AISSTREAM_URL);

  ws.on("open", () => {
    console.log("AIS: Connected. Subscribing to France bounding box...");
    s.connecting = false;
    s.messageCount = 0;
    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: OPS_BBOXES,
      FilterMessageTypes: ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
    };
    ws.send(JSON.stringify(subscription));

    if (s.pingInterval) clearInterval(s.pingInterval);
    s.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 20_000);
  });

  ws.on("message", (data: WebSocket.Data) => {
    s.messageCount++;
    if (s.messageCount === 1) {
      console.log("AIS: First message received — stream active");
    }
    if (s.messageCount % 100 === 0) {
      console.log(`AIS: ${s.messageCount} messages received, ${s.vesselCache.size} vessels tracked`);
    }
    handleMessage(data.toString());
  });

  ws.on("error", (err: Error) => {
    console.error("AIS: WebSocket error:", err.message);
    s.connecting = false;
  });

  ws.on("close", (code: number) => {
    console.warn(`AIS: Connection closed (code ${code}, after ${s.messageCount} msgs). Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    if (s.pingInterval) { clearInterval(s.pingInterval); s.pingInterval = null; }
    s.ws = null;
    s.connecting = false;
    if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
    s.reconnectTimer = setTimeout(() => {
      s.reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  });

  s.ws = ws;
}

export function ensureAISConnection() {
  const s = state();
  if (s.ws && s.ws.readyState === WebSocket.OPEN) return;
  if (s.connecting) return;
  if (s.reconnectTimer) return;
  connect();
}

export function getVessels(): Vessel[] {
  cleanExpiredVessels();
  return Array.from(state().vesselCache.values());
}

export function getVesselCount(): number {
  return state().vesselCache.size;
}

export function isConnected(): boolean {
  const s = state();
  return s.ws !== null && s.ws.readyState === WebSocket.OPEN;
}
