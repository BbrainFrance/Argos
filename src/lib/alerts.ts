import { Aircraft, Alert, Entity, ZoneOfInterest } from "@/types";

let alertIdCounter = 0;
function makeId(): string {
  return `alert-${Date.now()}-${alertIdCounter++}`;
}

function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const MILITARY_PREFIXES = ["DUKE", "TOPCAT", "EVAC", "REACH", "RCH", "CNV", "RRR", "FORTE", "JAKE", "HOMER", "LAGR", "NCHO", "VIPER"];

export function generateAlerts(
  entities: Entity[],
  zones: ZoneOfInterest[],
  previousEntityPositions: Map<string, string[]>
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  for (const entity of entities) {
    if (entity.type !== "aircraft" || !entity.position) continue;
    const ac = entity as Aircraft;
    const cs = ac.metadata.callsign;

    if (cs && MILITARY_PREFIXES.some((p) => cs.startsWith(p))) {
      alerts.push({
        id: makeId(), type: "warning", category: "military",
        title: "Vol militaire detecte",
        message: `${cs} (${ac.metadata.originCountry}) — Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "N/A"}m — Cap: ${ac.metadata.trueTrack?.toFixed(0) ?? "N/A"}°`,
        entityId: ac.id, timestamp: now, source: "opensky", acknowledged: false,
      });
    }

    const squawk = ac.metadata.squawk;
    if (squawk === "7700") {
      alerts.push({ id: makeId(), type: "critical", category: "squawk", title: "URGENCE GENERALE — Squawk 7700", message: `${cs ?? ac.metadata.icao24} (${ac.metadata.originCountry}) declare une urgence generale`, entityId: ac.id, timestamp: now, source: "opensky", acknowledged: false });
    }
    if (squawk === "7600") {
      alerts.push({ id: makeId(), type: "critical", category: "squawk", title: "PANNE RADIO — Squawk 7600", message: `${cs ?? ac.metadata.icao24} (${ac.metadata.originCountry}) — perte de communication`, entityId: ac.id, timestamp: now, source: "opensky", acknowledged: false });
    }
    if (squawk === "7500") {
      alerts.push({ id: makeId(), type: "critical", category: "squawk", title: "DETOURNEMENT — Squawk 7500", message: `${cs ?? ac.metadata.icao24} (${ac.metadata.originCountry}) — code detournement actif`, entityId: ac.id, timestamp: now, source: "opensky", acknowledged: false });
    }

    if (!ac.metadata.onGround && ac.metadata.baroAltitude && ac.metadata.baroAltitude < 300 && ac.metadata.velocity && ac.metadata.velocity > 80) {
      alerts.push({ id: makeId(), type: "warning", category: "anomaly", title: "Vol tres basse altitude", message: `${cs ?? ac.metadata.icao24} a ${ac.metadata.baroAltitude.toFixed(0)}m — ${(ac.metadata.velocity * 3.6).toFixed(0)} km/h`, entityId: ac.id, timestamp: now, source: "opensky", acknowledged: false });
    }

    if (ac.trail.length >= 10) {
      const recent = ac.trail.slice(-10);
      const headings: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        const dLat = recent[i].lat - recent[i - 1].lat;
        const dLng = recent[i].lng - recent[i - 1].lng;
        headings.push(Math.atan2(dLng, dLat) * (180 / Math.PI));
      }
      let totalTurn = 0;
      for (let i = 1; i < headings.length; i++) {
        let diff = headings[i] - headings[i - 1];
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        totalTurn += Math.abs(diff);
      }
      if (totalTurn > 270) {
        alerts.push({ id: makeId(), type: "warning", category: "pattern", title: "Schema circulaire detecte", message: `${cs ?? ac.metadata.icao24} effectue un vol circulaire (rotation ${totalTurn.toFixed(0)}°) — possible surveillance`, entityId: ac.id, timestamp: now, source: "analysis", acknowledged: false });
      }
    }

    for (const zone of zones) {
      if (!zone.active || !ac.position) continue;
      const inside = isPointInPolygon(ac.position.lat, ac.position.lng, zone.polygon);
      const prevZones = previousEntityPositions.get(ac.id) ?? [];
      const wasInside = prevZones.includes(zone.id);

      if (inside && !wasInside && zone.alertOnEntry) {
        alerts.push({ id: makeId(), type: "danger", category: "geofence", title: `Entree zone: ${zone.name}`, message: `${cs ?? ac.metadata.icao24} a penetre dans la zone "${zone.name}"`, entityId: ac.id, zoneId: zone.id, timestamp: now, source: "geofence", acknowledged: false });
      }
      if (!inside && wasInside && zone.alertOnExit) {
        alerts.push({ id: makeId(), type: "info", category: "geofence", title: `Sortie zone: ${zone.name}`, message: `${cs ?? ac.metadata.icao24} a quitte la zone "${zone.name}"`, entityId: ac.id, zoneId: zone.id, timestamp: now, source: "geofence", acknowledged: false });
      }
    }
  }

  return alerts.slice(0, 50);
}
