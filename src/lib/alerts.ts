import { Aircraft, Alert } from "@/types";

let alertIdCounter = 0;

function makeId(): string {
  return `alert-${Date.now()}-${alertIdCounter++}`;
}

export function generateAlerts(aircraft: Aircraft[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  const militaryPrefixes = ["DUKE", "TOPCAT", "EVAC", "REACH", "RCH", "CNV", "RRR"];
  const militaryCountries = ["United States", "United Kingdom", "Russia", "China"];

  for (const ac of aircraft) {
    if (!ac.callsign || !ac.latitude || !ac.longitude) continue;

    const isMilitary = militaryPrefixes.some((p) => ac.callsign!.startsWith(p));
    if (isMilitary) {
      alerts.push({
        id: makeId(),
        type: "warning",
        title: "Vol militaire detecte",
        message: `${ac.callsign} (${ac.originCountry}) - Alt: ${ac.baroAltitude?.toFixed(0) ?? "N/A"}m`,
        timestamp: now,
        source: "opensky",
      });
    }

    if (ac.squawk === "7700") {
      alerts.push({
        id: makeId(),
        type: "danger",
        title: "URGENCE - Squawk 7700",
        message: `${ac.callsign} (${ac.originCountry}) declare une urgence generale`,
        timestamp: now,
        source: "opensky",
      });
    }

    if (ac.squawk === "7600") {
      alerts.push({
        id: makeId(),
        type: "danger",
        title: "Panne radio - Squawk 7600",
        message: `${ac.callsign} (${ac.originCountry}) - perte de communication`,
        timestamp: now,
        source: "opensky",
      });
    }

    if (ac.squawk === "7500") {
      alerts.push({
        id: makeId(),
        type: "danger",
        title: "DETOURNEMENT - Squawk 7500",
        message: `${ac.callsign} (${ac.originCountry}) - code detournement actif`,
        timestamp: now,
        source: "opensky",
      });
    }

    if (
      !ac.onGround &&
      ac.baroAltitude &&
      ac.baroAltitude < 300 &&
      ac.velocity &&
      ac.velocity > 100
    ) {
      alerts.push({
        id: makeId(),
        type: "warning",
        title: "Vol tres basse altitude",
        message: `${ac.callsign} (${ac.originCountry}) a ${ac.baroAltitude.toFixed(0)}m, vitesse ${(ac.velocity * 3.6).toFixed(0)} km/h`,
        timestamp: now,
        source: "opensky",
      });
    }

    if (
      militaryCountries.includes(ac.originCountry) &&
      !isMilitary &&
      ac.baroAltitude &&
      ac.baroAltitude > 10000
    ) {
      const isOverFrance =
        ac.latitude > 42 && ac.latitude < 51 && ac.longitude > -4 && ac.longitude < 9;
      if (isOverFrance) {
        // tracked but not alerted unless specific pattern
      }
    }
  }

  return alerts.slice(0, 20);
}
