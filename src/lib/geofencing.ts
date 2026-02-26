import { Entity, ZoneOfInterest, Alert } from "@/types";

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const entityZoneState = new Map<string, Set<string>>();

export function checkGeofencing(
  entities: Entity[],
  zones: ZoneOfInterest[]
): Alert[] {
  const alerts: Alert[] = [];
  const activeZones = zones.filter((z) => z.active && (z.alertOnEntry || z.alertOnExit));

  for (const entity of entities) {
    if (!entity.position) continue;

    const key = entity.id;
    let prevZones = entityZoneState.get(key);
    if (!prevZones) {
      prevZones = new Set<string>();
      entityZoneState.set(key, prevZones);
    }

    const currentZones = new Set<string>();

    for (const zone of activeZones) {
      const inside = pointInPolygon(entity.position.lat, entity.position.lng, zone.polygon);

      if (inside) {
        currentZones.add(zone.id);

        if (!prevZones.has(zone.id) && zone.alertOnEntry) {
          alerts.push({
            id: `geo-entry-${entity.id}-${zone.id}-${Date.now()}`,
            type: zone.type === "exclusion" ? "critical" : "warning",
            category: "geofence",
            title: `Intrusion zone ${zone.name}`,
            message: `${entity.label} (${entity.type}) a penetre dans ${zone.name} [${zone.type.toUpperCase()}]`,
            entityId: entity.id,
            zoneId: zone.id,
            timestamp: new Date(),
            source: "GEOFENCE",
            acknowledged: false,
          });
        }
      } else {
        if (prevZones.has(zone.id) && zone.alertOnExit) {
          alerts.push({
            id: `geo-exit-${entity.id}-${zone.id}-${Date.now()}`,
            type: "info",
            category: "geofence",
            title: `Sortie zone ${zone.name}`,
            message: `${entity.label} (${entity.type}) a quitte ${zone.name}`,
            entityId: entity.id,
            zoneId: zone.id,
            timestamp: new Date(),
            source: "GEOFENCE",
            acknowledged: false,
          });
        }
      }
    }

    entityZoneState.set(key, currentZones);
  }

  return alerts;
}

export function getEntitiesInZone(entities: Entity[], zone: ZoneOfInterest): Entity[] {
  return entities.filter((e) => e.position && pointInPolygon(e.position.lat, e.position.lng, zone.polygon));
}
