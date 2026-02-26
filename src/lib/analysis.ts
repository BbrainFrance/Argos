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

  // Circular flight pattern (loiter/surveillance)
  for (const ac of aircraft) {
    if (ac.metadata.onGround || ac.trail.length < 6) continue;
    const trail = ac.trail.slice(-20);
    let totalHeadingChange = 0;
    for (let i = 1; i < trail.length; i++) {
      const dlat = trail[i].lat - trail[i - 1].lat;
      const dlng = trail[i].lng - trail[i - 1].lng;
      if (i > 1) {
        const dlat0 = trail[i - 1].lat - trail[i - 2].lat;
        const dlng0 = trail[i - 1].lng - trail[i - 2].lng;
        const angle1 = Math.atan2(dlng0, dlat0);
        const angle2 = Math.atan2(dlng, dlat);
        let diff = (angle2 - angle1) * (180 / Math.PI);
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        totalHeadingChange += Math.abs(diff);
      }
    }

    if (totalHeadingChange > 270) {
      results.push({
        id: makeId(),
        type: "pattern",
        severity: totalHeadingChange > 600 ? "high" : "medium",
        title: `Schema circulaire detecte`,
        description: `${ac.label} effectue un vol circulaire (rotation ${totalHeadingChange.toFixed(0)}°) — possible surveillance`,
        entities: [ac.id],
        confidence: Math.min(0.95, totalHeadingChange / 720),
        timestamp: now,
      });
    }
  }

  // Convoy pattern — multiple entities moving in same direction
  const moving = nonGround.filter((a) => a.metadata.velocity && a.metadata.velocity > 50 && a.metadata.trueTrack != null);
  const convoyChecked = new Set<string>();
  for (const lead of moving) {
    if (convoyChecked.has(lead.id) || !lead.position) continue;
    const followers = moving.filter((other) => {
      if (other.id === lead.id || !other.position || convoyChecked.has(other.id)) return false;
      const dist = haversineKm(lead.position!.lat, lead.position!.lng, other.position!.lat, other.position!.lng);
      if (dist > 15) return false;
      const headingDiff = Math.abs((lead.metadata.trueTrack ?? 0) - (other.metadata.trueTrack ?? 0));
      return headingDiff < 20 || headingDiff > 340;
    });

    if (followers.length >= 2) {
      const ids = [lead.id, ...followers.map((f) => f.id)];
      ids.forEach((id) => convoyChecked.add(id));
      results.push({
        id: makeId(),
        type: "pattern",
        severity: "high",
        title: `Formation / convoi aerien detecte`,
        description: `${ids.length} aeronefs en formation, cap ~${lead.metadata.trueTrack?.toFixed(0)}° — possible escorte ou vol militaire`,
        entities: ids,
        confidence: 0.8,
        timestamp: now,
      });
    }
  }

  // Convergence toward point — multiple entities heading to same area
  const convergenceGrid = new Map<string, Aircraft[]>();
  for (const ac of moving) {
    if (!ac.position || !ac.metadata.velocity || !ac.metadata.trueTrack) continue;
    const headRad = (ac.metadata.trueTrack * Math.PI) / 180;
    const distKm = (ac.metadata.velocity * 3.6 * 15) / 60;
    const futLat = ac.position.lat + (distKm / 111.32) * Math.cos(headRad);
    const futLng = ac.position.lng + (distKm / (111.32 * Math.cos(ac.position.lat * Math.PI / 180))) * Math.sin(headRad);
    const gridKey = `${Math.round(futLat * 4) / 4},${Math.round(futLng * 4) / 4}`;
    if (!convergenceGrid.has(gridKey)) convergenceGrid.set(gridKey, []);
    convergenceGrid.get(gridKey)!.push(ac);
  }

  for (const [grid, converging] of convergenceGrid) {
    if (converging.length >= 3) {
      const [latStr, lngStr] = grid.split(",");
      results.push({
        id: makeId(),
        type: "prediction",
        severity: "high",
        title: `Convergence detectee`,
        description: `${converging.length} aeronefs convergent vers ${latStr}°N ${lngStr}°E (T+15min)`,
        entities: converging.map((c) => c.id),
        confidence: 0.7,
        timestamp: now,
      });
    }
  }

  // Vessel anomalies — high speed vessel
  const vessels = entities.filter((e) => e.type === "vessel" && e.position);
  for (const v of vessels) {
    const speed = (v.metadata as Record<string, number | null>).speed;
    if (speed && speed > 25) {
      results.push({
        id: makeId(),
        type: "anomaly",
        severity: "medium",
        title: `Navire grande vitesse`,
        description: `${v.label} a ${speed.toFixed(1)} noeuds — possible intercepteur ou contrebande`,
        entities: [v.id],
        confidence: 0.65,
        timestamp: now,
      });
    }
  }

  return results.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return sev[a.severity] - sev[b.severity];
  });
}
