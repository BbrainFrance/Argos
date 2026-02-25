export interface Aircraft {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  longitude: number | null;
  latitude: number | null;
  baroAltitude: number | null;
  geoAltitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  lastContact: number;
  timePosition: number | null;
}

export interface MapViewState {
  mode: "2d" | "3d";
  center: [number, number];
  zoom: number;
}

export interface Alert {
  id: string;
  type: "info" | "warning" | "danger";
  title: string;
  message: string;
  timestamp: Date;
  source: string;
}

export interface DashboardStats {
  totalAircraft: number;
  activeFlights: number;
  avgAltitude: number;
  avgSpeed: number;
  countriesDetected: string[];
}

export type DataSource = "opensky" | "ais" | "sentinel" | "osm";

export interface DataLayer {
  id: string;
  name: string;
  source: DataSource;
  enabled: boolean;
  color: string;
  icon: string;
}
