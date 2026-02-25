import { Aircraft, AnalysisResult, Entity, Infrastructure } from "@/types";

let analysisIdCounter = 0;
function makeId(): string {
  return `analysis-${Date.now()}-${analysisIdCounter++}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function runAnalysis(entities: Entity[], infrastructure: Infrastructure[]): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  const now = new Date();
  const aircraft = entities.filter((e): e is Aircraft => e.type === "aircraft" && !!e.position);

  // Proximity to critical infrastructure
  const criticalInfra = infrastructure.filter((i) => i.metadata.importance === "critical" && i.position);
  for (const ac of aircraft) {
    if (ac.metadata.onGround || !ac.position) continue;
    for (const infra of criticalInfra) {
      if (!infra.position) continue;
      const dist = haversineKm(ac.position.lat, ac.position.lng, infra.position.lat, infra.position.lng);

      if (dist < 5 && ac.metadata.baroAltitude && ac.metadata.baroAltitude < 1500) {
        const isAirport = infra.metadata.category === "airport";
        if (isAirport) continue;

        results.push({
          id: makeId(),
          type: "anomaly",
          severity: infra.metadata.category === "nuclear_plant" ? "critical" : "high",
          title: `Proximite infrastructure critique`,
          description: `${ac.label} a ${dist.toFixed(1)}km de ${infra.metadata.name} — Alt: ${ac.metadata.baroAltitude.toFixed(0)}m`,
          entities: [ac.id, infra.id],
          confidence: dist < 2 ? 0.95 : 0.75,
          timestamp: now,
        });
      }
    }
  }

  // Speed anomalies
  for (const ac of aircraft) {
    if (ac.metadata.onGround || !ac.metadata.velocity) continue;
    const speedKmh = ac.metadata.velocity * 3.6;
    if (speedKmh > 1200) {
      results.push({
        id: makeId(),
        type: "anomaly",
        severity: "medium",
        title: `Vitesse anormalement elevee`,
        description: `${ac.label} a ${speedKmh.toFixed(0)} km/h — possible aeronef militaire`,
        entities: [ac.id],
        confidence: 0.7,
        timestamp: now,
      });
    }
  }

  // Altitude anomalies (very high altitude, possible U2/recon)
  for (const ac of aircraft) {
    if (ac.metadata.onGround || !ac.metadata.baroAltitude) continue;
    if (ac.metadata.baroAltitude > 15000) {
      results.push({
        id: makeId(),
        type: "anomaly",
        severity: "medium",
        title: `Vol haute altitude inhabituelle`,
        description: `${ac.label} (${ac.metadata.originCountry}) a ${ac.metadata.baroAltitude.toFixed(0)}m — possible reconnaissance`,
        entities: [ac.id],
        confidence: 0.6,
        timestamp: now,
      });
    }
  }

  // Cluster detection — aircraft grouping
  const nonGround = aircraft.filter((a) => !a.metadata.onGround);
  const checked = new Set<string>();
  for (const ac of nonGround) {
    if (checked.has(ac.id) || !ac.position) continue;
    const nearby = nonGround.filter((other) => {
      if (other.id === ac.id || !other.position) return false;
      return haversineKm(ac.position!.lat, ac.position!.lng, other.position!.lat, other.position!.lng) < 3;
    });

    if (nearby.length >= 3) {
      const ids = [ac.id, ...nearby.map((n) => n.id)];
      ids.forEach((id) => checked.add(id));
      results.push({
        id: makeId(),
        type: "pattern",
        severity: "medium",
        title: `Concentration aerienne detectee`,
        description: `${ids.length} aeronefs dans un rayon de 3km autour de ${ac.position!.lat.toFixed(2)}°N ${ac.position!.lng.toFixed(2)}°E`,
        entities: ids,
        confidence: 0.8,
        timestamp: now,
      });
    }
  }

  // Vertical rate anomaly — rapid descent
  for (const ac of aircraft) {
    if (ac.metadata.onGround || !ac.metadata.verticalRate) continue;
    if (ac.metadata.verticalRate < -15) {
      results.push({
        id: makeId(),
        type: "anomaly",
        severity: "high",
        title: `Descente rapide detectee`,
        description: `${ac.label} en descente a ${ac.metadata.verticalRate.toFixed(1)} m/s — Alt: ${ac.metadata.baroAltitude?.toFixed(0) ?? "?"}m`,
        entities: [ac.id],
        confidence: 0.85,
        timestamp: now,
      });
    }
  }

  return results.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return sev[a.severity] - sev[b.severity];
  });
}
