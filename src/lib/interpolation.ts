import { Entity, Aircraft, Vessel, GeoPosition } from "@/types";

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

function metersPerDegLat(): number {
  return (Math.PI * EARTH_RADIUS_M) / 180;
}

function metersPerDegLng(lat: number): number {
  return metersPerDegLat() * Math.cos(lat * DEG_TO_RAD);
}

export function interpolateEntities(
  entities: Entity[],
  dtSeconds: number
): Entity[] {
  if (dtSeconds <= 0 || dtSeconds > 30) return entities;

  return entities.map((e) => {
    if (!e.position) return e;

    if (e.type === "aircraft") {
      const ac = e as Aircraft;
      const velocity = ac.metadata.velocity;
      const heading = ac.metadata.trueTrack;
      if (!velocity || velocity < 5 || heading === null || ac.metadata.onGround) return e;

      const headingRad = heading * DEG_TO_RAD;
      const distM = velocity * dtSeconds;

      const dLat = (distM * Math.cos(headingRad)) / metersPerDegLat();
      const dLng = (distM * Math.sin(headingRad)) / metersPerDegLng(ac.position!.lat);

      const newPos: GeoPosition = {
        lat: ac.position!.lat + dLat,
        lng: ac.position!.lng + dLng,
        alt: ac.position!.alt,
        timestamp: ac.position!.timestamp,
      };

      return { ...ac, position: newPos } as Entity;
    }

    if (e.type === "vessel") {
      const vs = e as Vessel;
      const speed = vs.metadata.speed;
      const course = vs.metadata.course;
      if (!speed || speed < 0.5 || course === null) return e;

      const speedMs = speed * 0.514444;
      const courseRad = course * DEG_TO_RAD;
      const distM = speedMs * dtSeconds;

      const dLat = (distM * Math.cos(courseRad)) / metersPerDegLat();
      const dLng = (distM * Math.sin(courseRad)) / metersPerDegLng(vs.position!.lat);

      const newPos: GeoPosition = {
        lat: vs.position!.lat + dLat,
        lng: vs.position!.lng + dLng,
        timestamp: vs.position!.timestamp,
      };

      return { ...vs, position: newPos } as Entity;
    }

    return e;
  });
}

export interface PredictionPoint {
  lat: number;
  lng: number;
  timeOffset: number;
}

export function predictTrajectory(entity: Entity, durationMinutes: number = 15, steps: number = 8): PredictionPoint[] {
  if (!entity.position) return [];
  const points: PredictionPoint[] = [];

  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    const velocity = ac.metadata.velocity;
    const heading = ac.metadata.trueTrack;
    if (!velocity || velocity < 10 || heading === null || ac.metadata.onGround) return [];

    const headingRad = heading * DEG_TO_RAD;
    for (let i = 1; i <= steps; i++) {
      const dt = (durationMinutes * 60 * i) / steps;
      const distM = velocity * dt;
      const dLat = (distM * Math.cos(headingRad)) / metersPerDegLat();
      const dLng = (distM * Math.sin(headingRad)) / metersPerDegLng(ac.position!.lat);
      points.push({ lat: ac.position!.lat + dLat, lng: ac.position!.lng + dLng, timeOffset: dt });
    }
  }

  if (entity.type === "vessel") {
    const vs = entity as Vessel;
    const speed = vs.metadata.speed;
    const course = vs.metadata.course;
    if (!speed || speed < 0.5 || course === null) return [];

    const speedMs = speed * 0.514444;
    const courseRad = course * DEG_TO_RAD;
    for (let i = 1; i <= steps; i++) {
      const dt = (durationMinutes * 60 * i) / steps;
      const distM = speedMs * dt;
      const dLat = (distM * Math.cos(courseRad)) / metersPerDegLat();
      const dLng = (distM * Math.sin(courseRad)) / metersPerDegLng(vs.position!.lat);
      points.push({ lat: vs.position!.lat + dLat, lng: vs.position!.lng + dLng, timeOffset: dt });
    }
  }

  return points;
}
