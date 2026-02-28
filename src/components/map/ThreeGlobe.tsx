"use client";

import { useEffect, useRef, useState, useCallback, Component, type ReactNode } from "react";
import { Entity, Aircraft, Vessel, Infrastructure, ZoneOfInterest, SatellitePosition, ConflictEvent, FireHotspot, NaturalDisaster, CyberThreat } from "@/types";
import { INFRA_ICONS } from "@/lib/infrastructure";
import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ion,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
  Math as CesiumMath,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  PolygonHierarchy,
  ColorMaterialProperty,
  NearFarScalar,
  HeightReference,
  createGooglePhotorealistic3DTileset,
  Ellipsoid,
  CameraEventType,
  KeyboardEventModifier,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// ─── MGRS conversion ────────────────────────────────────────────────────────
function latLonToMGRS(lat: number, lon: number): string {
  if (lat < -80 || lat > 84) return "N/A";
  const zoneNumber = Math.floor((lon + 180) / 6) + 1;
  const letters = "CDEFGHJKLMNPQRSTUVWXX";
  const latBand = letters[Math.floor((lat + 80) / 8)] || "X";
  const e100k = Math.floor(((lon + 180) % 6) * 1e5 / 100000) + 1;
  const setIdx = ((zoneNumber - 1) % 6);
  const eLetters = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ", "ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
  const eLetter = eLetters[setIdx]?.[e100k - 1] || "A";
  const nLetters = "ABCDEFGHJKLMNPQRSTUV";
  const nIdx = Math.floor(lat * 110574 / 100000) % 20;
  const nLetter = nLetters[Math.abs(nIdx)] || "A";
  const easting = Math.floor(((lon - (zoneNumber * 6 - 183)) * 111320 * Math.cos(lat * Math.PI / 180)) % 100000);
  const northing = Math.floor((lat * 110574) % 100000);
  const eStr = String(Math.abs(easting)).padStart(5, "0").slice(0, 4);
  const nStr = String(Math.abs(northing)).padStart(5, "0").slice(0, 4);
  return `${zoneNumber}${latBand} ${eLetter}${nLetter} ${eStr} ${nStr}`;
}

function formatDMS(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? "N" : "S") : (deg >= 0 ? "E" : "W");
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d - m / 60) * 3600).toFixed(2);
  return `${d}°${String(m).padStart(2, "0")}'${String(s).padStart(5, "0")}"${dir}`;
}

// ─── Visual filter types ─────────────────────────────────────────────────────
type VisualFilter = "normal" | "crt" | "nvg" | "flir" | "anime" | "noir" | "snow" | "ai";

const FILTER_CONFIG: Record<VisualFilter, { label: string; icon: string; css: string }> = {
  normal: { label: "Normal", icon: "◻", css: "" },
  crt: { label: "CRT", icon: "▦", css: "sepia(0.3) contrast(1.2) brightness(0.9)" },
  nvg: { label: "NVG", icon: "☽", css: "brightness(1.5) contrast(1.3) saturate(0.3) hue-rotate(80deg)" },
  flir: { label: "FLIR", icon: "🌡", css: "grayscale(1) contrast(2) brightness(1.1) invert(1)" },
  anime: { label: "Anime", icon: "◆", css: "saturate(2.5) contrast(1.1) brightness(1.1)" },
  noir: { label: "Noir", icon: "◈", css: "grayscale(1) contrast(1.4) brightness(0.85)" },
  snow: { label: "Snow", icon: "❄", css: "brightness(1.3) contrast(0.9) saturate(0.5) hue-rotate(200deg)" },
  ai: { label: "AI", icon: "⬡", css: "saturate(1.5) contrast(1.15) hue-rotate(-10deg) brightness(1.05)" },
};

// ─── City presets ────────────────────────────────────────────────────────────
const CITY_PRESETS = [
  { name: "Paris", lat: 48.8566, lng: 2.3522 },
  { name: "London", lat: 51.5074, lng: -0.1278 },
  { name: "New York", lat: 40.7128, lng: -74.006 },
  { name: "Washington DC", lat: 38.9072, lng: -77.0369 },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { name: "Dubai", lat: 25.2048, lng: 55.2708 },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { name: "Austin", lat: 30.2672, lng: -97.7431 },
];

// ─── POI landmarks ───────────────────────────────────────────────────────────
const POI_LANDMARKS: Record<string, { name: string; lat: number; lng: number }[]> = {
  Paris: [
    { name: "Tour Eiffel", lat: 48.8584, lng: 2.2945 },
    { name: "Arc de Triomphe", lat: 48.8738, lng: 2.295 },
    { name: "Notre-Dame", lat: 48.853, lng: 2.3499 },
    { name: "Louvre", lat: 48.8606, lng: 2.3376 },
    { name: "Sacre-Coeur", lat: 48.8867, lng: 2.3431 },
  ],
  London: [
    { name: "Tower Bridge", lat: 51.5055, lng: -0.0754 },
    { name: "The Shard", lat: 51.5045, lng: -0.0865 },
    { name: "Big Ben", lat: 51.5007, lng: -0.1246 },
    { name: "St Paul's", lat: 51.5138, lng: -0.0984 },
    { name: "The Gherkin", lat: 51.5145, lng: -0.0803 },
  ],
  "New York": [
    { name: "Empire State", lat: 40.7484, lng: -73.9857 },
    { name: "Statue of Liberty", lat: 40.6892, lng: -74.0445 },
    { name: "Central Park", lat: 40.7829, lng: -73.9654 },
    { name: "Times Square", lat: 40.758, lng: -73.9855 },
    { name: "Brooklyn Bridge", lat: 40.7061, lng: -73.9969 },
  ],
  "Washington DC": [
    { name: "US Capitol", lat: 38.8899, lng: -77.009 },
    { name: "Washington Monument", lat: 38.8895, lng: -77.0353 },
    { name: "Lincoln Memorial", lat: 38.8893, lng: -77.0502 },
    { name: "Pentagon", lat: 38.8719, lng: -77.0563 },
    { name: "Jefferson Memorial", lat: 38.8814, lng: -77.0365 },
  ],
  Tokyo: [
    { name: "Tokyo Tower", lat: 35.6586, lng: 139.7454 },
    { name: "Shibuya Crossing", lat: 35.6595, lng: 139.7004 },
    { name: "Imperial Palace", lat: 35.6852, lng: 139.7528 },
    { name: "Senso-ji", lat: 35.7148, lng: 139.7967 },
    { name: "Skytree", lat: 35.7101, lng: 139.8107 },
  ],
  Dubai: [
    { name: "Burj Khalifa", lat: 25.1972, lng: 55.2744 },
    { name: "Palm Jumeirah", lat: 25.1124, lng: 55.139 },
    { name: "Burj Al Arab", lat: 25.1413, lng: 55.1853 },
    { name: "Dubai Mall", lat: 25.1985, lng: 55.2796 },
    { name: "Dubai Marina", lat: 25.0805, lng: 55.1403 },
  ],
  "San Francisco": [
    { name: "Golden Gate", lat: 37.8199, lng: -122.4783 },
    { name: "Alcatraz", lat: 37.8267, lng: -122.4233 },
    { name: "Fisherman's Wharf", lat: 37.808, lng: -122.4177 },
    { name: "Chinatown", lat: 37.7941, lng: -122.4078 },
    { name: "Transamerica", lat: 37.7952, lng: -122.4028 },
  ],
  Austin: [
    { name: "Capitol", lat: 30.2747, lng: -97.7404 },
    { name: "Congress Bridge", lat: 30.2614, lng: -97.7453 },
    { name: "6th Street", lat: 30.2672, lng: -97.7396 },
    { name: "Zilker Park", lat: 30.267, lng: -97.773 },
    { name: "UT Tower", lat: 30.2862, lng: -97.7394 },
  ],
};

// ─── CCTV camera data (public traffic cameras) ──────────────────────────────
interface CCTVCamera {
  id: string; name: string; city: string; lat: number; lng: number; hdg: number; fov: number;
  embedUrl?: string;
  snapshotUrl?: string;
  sourceUrl?: string;
}
const CCTV_CAMERAS: CCTVCamera[] = [
  { id: "cctv-par-1", name: "Tour Eiffel HD", city: "Paris", lat: 48.8584, lng: 2.2945, hdg: 180, fov: 90, embedUrl: "https://www.youtube.com/embed/iZipA1LL_sU?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=iZipA1LL_sU" },
  { id: "cctv-par-2", name: "Sacre-Coeur Montmartre", city: "Paris", lat: 48.8867, lng: 2.3431, hdg: 180, fov: 70, embedUrl: "https://www.youtube.com/embed/vPbRHswf7JI?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=vPbRHswf7JI" },
  { id: "cctv-nyc-1", name: "Times Square 4K", city: "New York", lat: 40.758, lng: -73.9855, hdg: 180, fov: 75, embedUrl: "https://www.youtube.com/embed/QTTTY_ra2Tg?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=QTTTY_ra2Tg" },
  { id: "cctv-nyc-2", name: "Manhattan Skyline", city: "New York", lat: 40.7128, lng: -74.006, hdg: 90, fov: 80, embedUrl: "https://www.youtube.com/embed/1-iS7LArMPA?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=1-iS7LArMPA" },
  { id: "cctv-tok-1", name: "Shibuya Crossing", city: "Tokyo", lat: 35.6595, lng: 139.7004, hdg: 0, fov: 90, embedUrl: "https://www.youtube.com/embed/3q5Eoqhc4oc?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=3q5Eoqhc4oc" },
  { id: "cctv-lon-1", name: "Abbey Road Crossing", city: "London", lat: 51.532, lng: -0.1779, hdg: 0, fov: 80, embedUrl: "https://www.youtube.com/embed/S5hCqMGz6XA?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=S5hCqMGz6XA" },
  { id: "cctv-iss-1", name: "ISS Station Spatiale", city: "Orbite LEO", lat: 0, lng: 0, hdg: 0, fov: 180, embedUrl: "https://www.youtube.com/embed/P9C25Un7xaM?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=P9C25Un7xaM" },
  { id: "cctv-jax-1", name: "Jacksonville Beach", city: "Jacksonville", lat: 30.2947, lng: -81.3931, hdg: 90, fov: 80, embedUrl: "https://www.youtube.com/embed/Hu5a5sGN6XE?autoplay=1&mute=1", sourceUrl: "https://www.youtube.com/watch?v=Hu5a5sGN6XE" },
];

// ─── Error Boundary ──────────────────────────────────────────────────────────
class GlobeErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#000005]">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">🌐</div>
            <p className="text-sm font-mono text-argos-accent mb-2">MODE GLOBE INDISPONIBLE</p>
            <p className="text-[10px] font-mono text-argos-text-dim/60 mb-4">
              Le rendu 3D necessite WebGL2. Utilisez le mode 2D.
            </p>
            <p className="text-[8px] font-mono text-red-400/40">{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types & helpers ─────────────────────────────────────────────────────────
interface ThreeGlobeProps {
  entities: Entity[];
  infrastructure: Infrastructure[];
  zones: ZoneOfInterest[];
  selectedEntityId: string | null;
  onSelectEntity: (entity: Entity) => void;
  showTrails: boolean;
  showInfrastructure: boolean;
  showSatellite?: boolean;
  satellites?: SatellitePosition[];
  showSatellites?: boolean;
  conflictEvents?: ConflictEvent[];
  fireHotspots?: FireHotspot[];
  naturalDisasters?: NaturalDisaster[];
  cyberThreats?: CyberThreat[];
  userLocation?: { lat: number; lng: number } | null;
  geoRadius?: number;
  onSelectMapItem?: (item: import("@/components/dashboard/MapItemDetail").MapItem) => void;
}

function getEntityColor(entity: Entity, selectedId: string | null): [number, number, number, number] {
  const isSelected = entity.id === selectedId;
  if (entity.type === "aircraft") {
    const ac = entity as Aircraft;
    if (ac.metadata.squawk === "7700" || ac.metadata.squawk === "7600" || ac.metadata.squawk === "7500") return [1, 0.2, 0.2, 1];
    if (isSelected) return [0.06, 0.73, 0.51, 1];
    if (ac.tracked) return [0.96, 0.62, 0.04, 1];
    if (ac.flagged) return [0.94, 0.27, 0.27, 1];
    if (ac.metadata.onGround) return [0.28, 0.33, 0.41, 0.6];
    return [0, 0.83, 1, 1];
  }
  if (entity.type === "vessel") {
    if (isSelected) return [0.13, 0.83, 0.88, 1];
    if ((entity as Vessel).tracked) return [0.96, 0.62, 0.04, 1];
    if ((entity as Vessel).flagged) return [0.94, 0.27, 0.27, 1];
    return [0.06, 0.73, 0.51, 1];
  }
  return [0.4, 0.4, 0.4, 1];
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function ThreeGlobe({
  entities,
  infrastructure,
  zones,
  selectedEntityId,
  onSelectEntity,
  showTrails,
  showInfrastructure,
  satellites = [],
  showSatellites = false,
  conflictEvents = [],
  fireHotspots = [],
  naturalDisasters = [],
  cyberThreats = [],
  userLocation,
  geoRadius = 20,
  onSelectMapItem,
}: ThreeGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityMapRef = useRef<Map<string, Entity>>(new Map());
  const eventMapRef = useRef<Map<string, { type: string; data: unknown }>>(new Map());
  const onSelectRef = useRef(onSelectEntity);
  onSelectRef.current = onSelectEntity;
  const onSelectMapItemRef = useRef(onSelectMapItem);
  onSelectMapItemRef.current = onSelectMapItem;
  const [ready, setReady] = useState(false);

  // ─── overlay state ───
  const [activeFilter, setActiveFilter] = useState<VisualFilter>("normal");
  const [activeCity, setActiveCity] = useState<string>("Paris");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraLat, setCameraLat] = useState(46.6);
  const [cameraLng, setCameraLng] = useState(2.3);
  const [cameraAlt, setCameraAlt] = useState(3000000);
  const [showCCTV, setShowCCTV] = useState(false);
  const [selectedCCTV, setSelectedCCTV] = useState<CCTVCamera | null>(null);
  const [showDataLayers, setShowDataLayers] = useState(false);
  const [panopticSrc, setPanopticSrc] = useState(0);
  const [startTime] = useState(Date.now());

  // Update camera position for HUD
  const updateCameraInfo = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const carto = Cartographic.fromCartesian(viewer.camera.position);
    setCameraLat(CesiumMath.toDegrees(carto.latitude));
    setCameraLng(CesiumMath.toDegrees(carto.longitude));
    setCameraAlt(carto.height);
    setPanopticSrc(entities.length);
  }, [entities.length]);

  // City navigation
  const flyToCity = useCallback((city: typeof CITY_PRESETS[0]) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    setActiveCity(city.name);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(city.lng, city.lat, 1500),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
      duration: 2.0,
    });
  }, []);

  // Fly to POI
  const flyToPOI = useCallback((poi: { lat: number; lng: number }) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(poi.lng, poi.lat, 500),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-35),
        roll: 0,
      },
      duration: 1.5,
    });
  }, []);

  // ─── Cesium Viewer init ───
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    Ion.defaultAccessToken = "";
    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL = "/cesiumStatic";

    const viewer = new Viewer(containerRef.current, {
      timeline: false, animation: false, homeButton: false, geocoder: false,
      sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false,
      shadows: false,
      skyAtmosphere: undefined,
      requestRenderMode: false,
      msaaSamples: 1,
      useBrowserRecommendedResolution: true,
      contextOptions: {
        webgl: { antialias: false, powerPreference: "high-performance" },
      },
    });

    viewer.scene.globe.show = false;
    viewer.scene.backgroundColor = Color.fromCssColorString("#000005");
    viewer.scene.fog.enabled = false;
    (viewer.scene as unknown as Record<string, boolean>).fxaa = false;

    const ssc = viewer.scene.screenSpaceCameraController;
    ssc.minimumZoomDistance = 5;
    ssc.maximumZoomDistance = 50000000;
    ssc.enableZoom = true;
    ssc.enableRotate = true;
    ssc.enableTilt = true;
    ssc.enableTranslate = true;
    ssc.enableLook = true;
    ssc.tiltEventTypes = [
      CameraEventType.RIGHT_DRAG,
      CameraEventType.MIDDLE_DRAG,
      CameraEventType.PINCH,
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL },
      { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT },
    ];
    ssc.zoomEventTypes = [
      CameraEventType.WHEEL,
      CameraEventType.PINCH,
    ];
    ssc.rotateEventTypes = [CameraEventType.LEFT_DRAG];
    ssc.lookEventTypes = [];
    ssc.inertiaZoom = 0.8;
    ssc.inertiaSpin = 0.9;
    ssc.inertiaTranslate = 0.8;

    const canvas = viewer.canvas;
    canvas.addEventListener("contextmenu", (e: Event) => e.preventDefault());

    if (apiKey) {
      createGooglePhotorealistic3DTileset({ key: apiKey }, {
        maximumScreenSpaceError: 24,
        maximumMemoryUsage: 512,
        skipLevelOfDetail: true,
      } as Record<string, unknown>).then((tileset) => {
        if (!viewer.isDestroyed()) {
          viewer.scene.primitives.add(tileset);
          viewer.scene.requestRender();
        }
      }).catch((err) => {
        console.warn("Google 3D Tiles failed:", err);
        if (!viewer.isDestroyed()) viewer.scene.globe.show = true;
      });
    } else {
      viewer.scene.globe.show = true;
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(2.3, 46.6, 3000000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
      duration: 0,
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      if (defined(picked) && picked.id) {
        const id = picked.id._argosId;
        if (id) {
          const entity = entityMapRef.current.get(id);
          if (entity) { onSelectRef.current(entity); return; }
        }
        const eventId = picked.id._argosEventId;
        if (eventId) {
          const ev = eventMapRef.current.get(eventId);
          if (ev && onSelectMapItemRef.current) {
            onSelectMapItemRef.current({ type: ev.type, data: ev.data } as import("@/components/dashboard/MapItemDetail").MapItem);
          }
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.changed.addEventListener(() => {
      const carto = Cartographic.fromCartesian(viewer.camera.position);
      setCameraLat(CesiumMath.toDegrees(carto.latitude));
      setCameraLng(CesiumMath.toDegrees(carto.longitude));
      setCameraAlt(carto.height);
    });
    viewer.camera.percentageChanged = 0.01;

    viewerRef.current = viewer;
    setReady(true);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // ─── Entity rendering ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !ready) return;

    viewer.entities.removeAll();
    entityMapRef.current.clear();
    eventMapRef.current.clear();

    for (const e of entities.filter(e => e.position && (e.type === "aircraft" || e.type === "vessel"))) {
      const [r, g, b, a] = getEntityColor(e, selectedEntityId);
      const color = new Color(r, g, b, a);
      const isSelected = e.id === selectedEntityId;
      const pos = e.position!;
      let alt = 0;
      let label = e.label;
      if (e.type === "aircraft") {
        const ac = e as Aircraft;
        alt = ac.metadata.baroAltitude ?? 0;
        label = ac.label || ac.metadata.callsign || ac.metadata.icao24;
      }

      const cesiumEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(pos.lng, pos.lat, alt),
        point: {
          pixelSize: isSelected ? 10 : 6, color,
          outlineColor: Color.BLACK, outlineWidth: 1,
          scaleByDistance: new NearFarScalar(1000, 2, 8000000, 0.5),
          heightReference: HeightReference.NONE,
        },
        label: {
          text: label, font: "10px monospace", fillColor: color,
          outlineColor: Color.BLACK, outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian2(8, -4),
          scaleByDistance: new NearFarScalar(1000, 1, 5000000, 0),
          show: isSelected,
        },
      });
      (cesiumEntity as unknown as Record<string, unknown>)._argosId = e.id;
      entityMapRef.current.set(e.id, e);

      if (showTrails && e.trail.length > 1 && (e.tracked || isSelected)) {
        viewer.entities.add({
          polyline: {
            positions: e.trail.map(t => Cartesian3.fromDegrees(t.lng, t.lat, e.type === "aircraft" ? (alt || 1000) : 0)),
            width: 1.5, material: new ColorMaterialProperty(color.withAlpha(0.5)),
            clampToGround: e.type === "vessel",
          },
        });
      }
    }

    if (showInfrastructure) {
      for (const inf of infrastructure) {
        if (!inf.position) continue;
        const cfg = INFRA_ICONS[inf.metadata.category] ?? { icon: "📍", color: "#666" };
        const c = Color.fromCssColorString(cfg.color);
        const infraId = `infra-${inf.id}`;
        const cesiumInf = viewer.entities.add({
          position: Cartesian3.fromDegrees(inf.position.lng, inf.position.lat, 0),
          point: {
            pixelSize: inf.metadata.importance === "critical" ? 10 : 7, color: c,
            outlineColor: Color.BLACK, outlineWidth: 1,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1000, 2, 5000000, 0.5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${cfg.icon} ${inf.metadata.name}`, font: "10px sans-serif", fillColor: c,
            outlineColor: Color.BLACK, outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(8, -4),
            scaleByDistance: new NearFarScalar(500, 1, 2e6, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        (cesiumInf as unknown as Record<string, unknown>)._argosEventId = infraId;
        eventMapRef.current.set(infraId, { type: "infrastructure", data: inf });
      }
    }

    for (const zone of zones) {
      if (!zone.active || zone.polygon.length < 3) continue;
      const c = Color.fromCssColorString(zone.color);
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(zone.polygon.map(([lat, lng]) => Cartesian3.fromDegrees(lng, lat, 0))),
          material: new ColorMaterialProperty(c.withAlpha(0.1)),
          outline: true, outlineColor: c.withAlpha(0.6),
          heightReference: HeightReference.NONE,
        },
      });
    }

    if (showSatellites && satellites.length > 0) {
      const SAT_COLORS: Record<string, string> = {
        gps: "#f59e0b", galileo: "#3b82f6", glonass: "#ef4444",
        iridium: "#06b6d4", starlink: "#a855f7", military: "#dc2626", "french-mil": "#2563eb",
      };
      for (const sat of satellites) {
        const c = Color.fromCssColorString(SAT_COLORS[sat.group] ?? "#f59e0b");
        viewer.entities.add({
          position: Cartesian3.fromDegrees(sat.lng, sat.lat, sat.alt * 1000),
          point: { pixelSize: sat.group === "starlink" ? 3 : 5, color: c, scaleByDistance: new NearFarScalar(100000, 1, 20000000, 0.3) },
        });
      }
    }

    if (showCCTV) {
      for (const cam of CCTV_CAMERAS) {
        viewer.entities.add({
          position: Cartesian3.fromDegrees(cam.lng, cam.lat, 30),
          point: {
            pixelSize: 8, color: Color.CYAN, outlineColor: Color.BLACK, outlineWidth: 1,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(500, 3, 100000, 0.5),
          },
          label: {
            text: cam.name, font: "9px monospace", fillColor: Color.CYAN,
            outlineColor: Color.BLACK, outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(10, -6),
            scaleByDistance: new NearFarScalar(500, 1, 30000, 0),
          },
        });
      }
    }

    for (const ev of conflictEvents) {
      const isExplosion = ev.eventType === "battles" || ev.eventType === "explosions";
      const icons: Record<string, string> = { battles: "⚔️", explosions: "💥", protests: "✊", riots: "🔥", violence_against_civilians: "🎯", strategic_developments: "📡" };
      const evId = `conflict-${ev.lat}-${ev.lng}-${ev.eventType}`;
      const cesiumEv = viewer.entities.add({
        position: Cartesian3.fromDegrees(ev.lng, ev.lat, 100),
        point: {
          pixelSize: isExplosion ? 14 : 10,
          color: isExplosion ? Color.fromCssColorString("#ff2828") : Color.fromCssColorString("#ffaa00"),
          outlineColor: isExplosion ? Color.fromCssColorString("#ff6600") : Color.fromCssColorString("#ffcc00"),
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1e3, 3, 5e6, 0.4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${icons[ev.eventType] || "💥"} ${ev.actor1}${ev.fatalities > 0 ? ` (${ev.fatalities})` : ""}`,
          font: "12px sans-serif",
          fillColor: Color.fromCssColorString("#ff6666"),
          outlineColor: Color.BLACK, outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(14, -8),
          scaleByDistance: new NearFarScalar(1e3, 1.2, 2e6, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (cesiumEv as unknown as Record<string, unknown>)._argosEventId = evId;
      eventMapRef.current.set(evId, { type: "conflict", data: ev });
    }

    for (const f of fireHotspots) {
      const fId = `fire-${f.lat}-${f.lng}`;
      const cesiumF = viewer.entities.add({
        position: Cartesian3.fromDegrees(f.lng, f.lat, 50),
        point: {
          pixelSize: Math.min(6 + f.frp / 8, 14),
          color: Color.fromCssColorString("#ff7800"),
          outlineColor: Color.fromCssColorString("#ff4400"),
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1000, 2, 500000, 0.4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: "🔥",
          font: "14px sans-serif",
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(0, -14),
          scaleByDistance: new NearFarScalar(1e3, 1.2, 2e6, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (cesiumF as unknown as Record<string, unknown>)._argosEventId = fId;
      eventMapRef.current.set(fId, { type: "fire", data: f });
    }

    for (const d of naturalDisasters) {
      const icons: Record<string, string> = { earthquake: "🌍", flood: "🌊", cyclone: "🌀", volcano: "🌋", wildfire: "🔥", tsunami: "🌊", drought: "☀" };
      const colors: Record<string, string> = { red: "#ff0000", orange: "#ff8800", green: "#00cc66" };
      const dId = `disaster-${d.lat}-${d.lng}-${d.eventType}`;
      const cesiumD = viewer.entities.add({
        position: Cartesian3.fromDegrees(d.lng, d.lat, 100),
        point: {
          pixelSize: 12,
          color: Color.fromCssColorString(colors[d.severity] || "#00cc66"),
          outlineColor: Color.fromCssColorString(d.severity === "red" ? "#ff4444" : "#ffaa00"),
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1000, 2.5, 1000000, 0.5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${icons[d.eventType] || "⚠"} ${d.title}`,
          font: "10px monospace",
          fillColor: Color.fromCssColorString(colors[d.severity] || "#00cc66"),
          outlineColor: Color.BLACK, outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(14, -8),
          scaleByDistance: new NearFarScalar(1e3, 1.2, 2e6, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (cesiumD as unknown as Record<string, unknown>)._argosEventId = dId;
      eventMapRef.current.set(dId, { type: "disaster", data: d });
    }

    for (const c of cyberThreats) {
      if (c.lat == null || c.lng == null) continue;
      const cId = `cyber-${c.lat}-${c.lng}-${c.threatCategory}`;
      const cyberIcons: Record<string, string> = { malware: "🦠", botnet: "🤖", phishing: "🎣", c2: "💀", ransomware: "🔒", scanner: "🔍", exploit: "⚡" };
      const cesiumC = viewer.entities.add({
        position: Cartesian3.fromDegrees(c.lng!, c.lat!, 60),
        point: {
          pixelSize: 8,
          color: Color.fromCssColorString("#a855f7"),
          outlineColor: Color.fromCssColorString("#7722cc"),
          outlineWidth: 2,
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1000, 2, 500000, 0.4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${cyberIcons[c.threatCategory] || "🦠"} ${c.threatCategory}`,
          font: "9px monospace",
          fillColor: Color.fromCssColorString("#a855f7"),
          outlineColor: Color.BLACK, outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(12, -6),
          scaleByDistance: new NearFarScalar(1e3, 1.2, 2e6, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      (cesiumC as unknown as Record<string, unknown>)._argosEventId = cId;
      eventMapRef.current.set(cId, { type: "cyber", data: c });
    }

    if (userLocation) {
      viewer.entities.add({
        position: Cartesian3.fromDegrees(userLocation.lng, userLocation.lat, 20),
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString("#00d4ff"),
          outlineColor: Color.WHITE, outlineWidth: 3,
          heightReference: HeightReference.NONE,
        },
        label: {
          text: "📍 MA POSITION",
          font: "10px monospace",
          fillColor: Color.CYAN,
          outlineColor: Color.BLACK, outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(12, -10),
          scaleByDistance: new NearFarScalar(500, 1, 100000, 0),
        },
      });
    }
  }, [entities, infrastructure, zones, selectedEntityId, showTrails, showInfrastructure, satellites, showSatellites, ready, showCCTV, conflictEvents, fireHotspots, naturalDisasters, cyberThreats, userLocation]);

  // ─── HUD update interval ───
  useEffect(() => {
    const iv = setInterval(updateCameraInfo, 2000);
    return () => clearInterval(iv);
  }, [updateCameraInfo]);

  const activePois = POI_LANDMARKS[activeCity] || [];
  const visibleCCTVs = CCTV_CAMERAS.filter(c => c.city === activeCity);
  const altFormatted = cameraAlt < 1000 ? `${Math.round(cameraAlt)}m` : cameraAlt < 100000 ? `${(cameraAlt / 1000).toFixed(1)}km` : `${Math.round(cameraAlt / 1000)}km`;
  const gsd = cameraAlt < 500 ? "0.02m" : cameraAlt < 2000 ? "0.1m" : cameraAlt < 10000 ? "1m" : cameraAlt < 100000 ? "10m" : "100m+";
  const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
  const recTime = `${String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:${String(elapsedSec % 60).padStart(2, "0")}`;

  // ─── CRT overlay effect (scanlines + noise) ───
  const crtOverlay = activeFilter === "crt" ? (
    <div className="absolute inset-0 pointer-events-none z-20">
      <div className="w-full h-full" style={{
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
      }} />
    </div>
  ) : null;

  const nvgOverlay = activeFilter === "nvg" ? (
    <div className="absolute inset-0 pointer-events-none z-20" style={{
      background: "radial-gradient(circle at center, transparent 40%, rgba(0,20,0,0.6) 100%)",
    }} />
  ) : null;

  const snowOverlay = activeFilter === "snow" ? (
    <div className="absolute inset-0 pointer-events-none z-20 animate-pulse opacity-10" style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    }} />
  ) : null;

  return (
    <GlobeErrorBoundary>
      <div className="relative w-full h-full overflow-hidden" style={{ background: "#000005" }}>
        {/* ─── Cesium canvas (base layer, receives all mouse/wheel events) ─── */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* ─── CSS filter overlay (visual only, no events) ─── */}
        {activeFilter !== "normal" && (
          <div className="absolute inset-0 pointer-events-none" style={{
            filter: FILTER_CONFIG[activeFilter].css,
            mixBlendMode: "multiply",
          }} />
        )}

        {/* ─── Vignette lens effect ─── */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 85%, rgba(0,0,0,0.9) 100%)",
        }} />

        {crtOverlay}
        {nvgOverlay}
        {snowOverlay}

        {/* ═══ PANOPTIC HEADER BAR ═══ */}
        <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
          <div className="flex items-center gap-4 px-4 py-1.5 font-mono text-[9px] text-cyan-400/70 bg-black/40  border-b border-cyan-900/30">
            <span className="text-cyan-300/90 tracking-wider">PANOPTIC</span>
            <span>VIS:{entities.filter(e => e.position).length}</span>
            <span>SRC:{panopticSrc}</span>
            <span>DENS:{(panopticSrc / 100).toFixed(2)}</span>
            <span>ALT:{altFormatted}</span>
            <span className="ml-auto text-[8px] text-cyan-600/50">{new Date().toISOString().slice(0, 19)}Z</span>
          </div>
        </div>

        {/* ═══ TOP LEFT - Classification + Mode label ═══ */}
        <div className="absolute top-10 left-4 z-40 pointer-events-none">
          <div className="font-mono space-y-0.5">
            <p className="text-[9px] text-cyan-400/40 tracking-widest">RESTRICTED // ARGOS // NOFORN</p>
            <p className="text-[9px] text-cyan-600/30">KH11-4166 OPS-4117</p>
            <p className="text-sm font-bold text-cyan-300/80 tracking-wider">{FILTER_CONFIG[activeFilter].label.toUpperCase()}</p>
            <p className="text-[8px] text-cyan-500/40 mt-1">SUMMARY</p>
            <p className="text-[8px] text-cyan-400/50">{FILTER_CONFIG[activeFilter].label.toUpperCase()} VIEW NEAR {activeCity.toUpperCase()}</p>
          </div>
        </div>

        {/* ═══ DATA LAYERS PANEL (left sidebar) ═══ */}
        <div className="absolute top-40 left-4 z-50" style={{ pointerEvents: "auto" }}>
          <button
            onClick={() => setShowDataLayers(!showDataLayers)}
            className="font-mono text-[9px] text-cyan-400/70 bg-black/60 border border-cyan-900/40 px-3 py-1.5 hover:bg-cyan-900/20  tracking-wider cursor-pointer"
          >
            DATA LAYERS {showDataLayers ? "▴" : "▾"}
          </button>
          {showDataLayers && (
            <div className="mt-1 bg-black/90 border border-cyan-900/40  p-3 w-60 space-y-2">
              {/* Live Flights */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✈</span>
                  <div>
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">Live Flights</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">OpenSky Network</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-cyan-400/80">{entities.filter(e => e.type === "aircraft").length}</span>
                  <span className="text-[7px] font-mono px-1.5 py-0.5 bg-cyan-500/30 border border-cyan-400/60 text-cyan-300">ON</span>
                </div>
              </div>

              {/* Earthquakes */}
              <div className="flex items-center justify-between py-1 border-t border-cyan-900/20">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">⚡</span>
                  <div>
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">Earthquakes (24h)</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">USGS / GDELT</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-600/50">—</span>
              </div>

              {/* Satellites */}
              <div className="flex items-center justify-between py-1 border-t border-cyan-900/20">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">🛰</span>
                  <div>
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">Satellites</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">CelesTrak</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-400/80">{satellites.length}</span>
              </div>

              {/* Street Traffic */}
              <div className="flex items-center justify-between py-1 border-t border-cyan-900/20">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">🚗</span>
                  <div>
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">Street Traffic</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">Google Maps Traffic</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-600/50">—</span>
              </div>

              {/* Weather Radar */}
              <div className="flex items-center justify-between py-1 border-t border-cyan-900/20">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">🌧</span>
                  <div>
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">Weather Radar</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">OpenWeatherMap</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-cyan-600/50">—</span>
              </div>

              {/* CCTV Mesh - fully clickable row */}
              <button
                onClick={() => { setShowCCTV(!showCCTV); if (!showCCTV) setShowDataLayers(false); }}
                className="w-full flex items-center justify-between py-1.5 px-1 border-t border-cyan-900/20 hover:bg-cyan-900/20 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">📹</span>
                  <div className="text-left">
                    <p className="text-[10px] font-mono text-cyan-300/90 font-bold">CCTV Mesh</p>
                    <p className="text-[7px] font-mono text-cyan-600/50">{visibleCCTVs.length} cameras — {activeCity}</p>
                  </div>
                </div>
                <span className={`text-[8px] font-mono px-2 py-0.5 border ${showCCTV ? "bg-cyan-500/30 border-cyan-400/60 text-cyan-300" : "border-cyan-900/40 text-cyan-600/50 hover:border-cyan-500/40"}`}>
                  {showCCTV ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* ═══ CCTV PANEL — filtered by activeCity, anchored bottom-right ═══ */}
        {showCCTV && visibleCCTVs.length > 0 && (
          <div className="absolute bottom-4 right-4 z-50 bg-black/95 border border-cyan-900/40 p-3" style={{ pointerEvents: "auto", width: selectedCCTV?.embedUrl ? 400 : 240 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono text-cyan-300 tracking-wider">📹 {activeCity} ({visibleCCTVs.length})</p>
              <button onClick={() => { setShowCCTV(false); setSelectedCCTV(null); }} className="text-cyan-600/50 hover:text-cyan-300 text-xs cursor-pointer">✕</button>
            </div>

            <div className="space-y-1 mb-2">
              {visibleCCTVs.map(cam => (
                <button
                  key={cam.id}
                  onClick={() => {
                    setSelectedCCTV(prev => prev?.id === cam.id ? null : cam);
                    const v = viewerRef.current;
                    if (v && !v.isDestroyed() && cam.lat !== 0) {
                      v.camera.flyTo({
                        destination: Cartesian3.fromDegrees(cam.lng, cam.lat, 300),
                        orientation: { heading: CesiumMath.toRadians(cam.hdg), pitch: CesiumMath.toRadians(-40), roll: 0 },
                        duration: 1.5,
                      });
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 flex items-center gap-2 cursor-pointer text-[9px] font-mono transition-colors ${
                    selectedCCTV?.id === cam.id
                      ? "bg-cyan-500/20 text-cyan-200 border-l-2 border-cyan-400"
                      : "text-cyan-400/70 hover:bg-cyan-900/30 hover:text-cyan-300"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedCCTV?.id === cam.id ? "bg-cyan-300 animate-pulse" : "bg-green-600"}`} />
                  <span className="truncate">{cam.name}</span>
                </button>
              ))}
            </div>

            {selectedCCTV && (
              <div className="pt-2 border-t border-cyan-400/30 space-y-2">
                {selectedCCTV.embedUrl && (
                  <div className="relative w-full bg-black border border-cyan-900/30" style={{ aspectRatio: "16/9" }}>
                    <iframe
                      src={selectedCCTV.embedUrl}
                      className="w-full h-full"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="no-referrer"
                      style={{ border: "none" }}
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-600 text-white text-[7px] font-bold tracking-wider rounded-sm">● LIVE</div>
                  </div>
                )}
                <div className="flex items-center justify-between text-[8px] font-mono text-cyan-500/70">
                  <span>HDG {selectedCCTV.hdg}° | FOV {selectedCCTV.fov}°</span>
                  {selectedCCTV.sourceUrl && (
                    <a href={selectedCCTV.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-100">Ouvrir ↗</a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {showCCTV && visibleCCTVs.length === 0 && (
          <div className="absolute bottom-4 right-4 z-50 bg-black/95 border border-cyan-900/40 p-3" style={{ pointerEvents: "auto", width: 220 }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-cyan-300 tracking-wider">📹 CCTV</p>
              <button onClick={() => setShowCCTV(false)} className="text-cyan-600/50 hover:text-cyan-300 text-xs cursor-pointer">✕</button>
            </div>
            <p className="text-[9px] font-mono text-cyan-600/60">Aucune camera pour {activeCity}</p>
          </div>
        )}

        {/* ═══ RIGHT SIDE HUD ═══ */}
        <div className="absolute top-10 right-4 z-50 pointer-events-none font-mono text-right space-y-2">
          {/* REC indicator */}
          <div className="flex items-center justify-end gap-2" style={{ pointerEvents: "auto" }}>
            <button
              onClick={() => setIsRecording(!isRecording)}
              className={`flex items-center gap-1.5 px-2 py-0.5 text-[9px] border cursor-pointer ${isRecording ? "border-red-500/60 text-red-400 bg-red-900/20" : "border-cyan-900/40 text-cyan-600/50"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-cyan-800"}`} />
              REC {isRecording ? recTime : "—"}
            </button>
          </div>

          {/* GSD */}
          <div>
            <p className="text-[8px] text-cyan-600/40">GSD</p>
            <p className="text-[10px] text-cyan-400/70">{gsd}</p>
          </div>

          {/* ALT */}
          <div>
            <p className="text-[8px] text-cyan-600/40">ALT</p>
            <p className="text-sm text-cyan-300/80">{altFormatted}</p>
          </div>
        </div>

        {/* ═══ BOTTOM LEFT - MGRS + Coordinates ═══ */}
        <div className="absolute bottom-3 left-4 z-30 pointer-events-none font-mono">
          <p className="text-[9px] text-cyan-400/50 tracking-wider">┗ MGRS: {latLonToMGRS(cameraLat, cameraLng)}</p>
          <p className="text-[9px] text-cyan-400/60 mt-0.5">  {formatDMS(cameraLat, true)} {formatDMS(cameraLng, false)}</p>
        </div>

        {/* ═══ CITY + POI - compact bar (right side, above filter bar) ═══ */}
        <div className="absolute bottom-14 right-4 z-50 flex flex-col items-end gap-1" style={{ pointerEvents: "auto" }}>
          <div className="flex items-center gap-1 flex-wrap justify-end max-w-[500px]">
            {CITY_PRESETS.map(city => (
              <button
                key={city.name}
                onClick={() => flyToCity(city)}
                className={`text-[8px] font-mono px-2 py-1 border transition-all ${city.name === activeCity
                  ? "bg-cyan-500/30 border-cyan-400/60 text-cyan-200"
                  : "bg-black/60 border-cyan-900/30 text-cyan-600/60 hover:border-cyan-500/40 hover:text-cyan-300"
                  }`}
              >
                {city.name}
              </button>
            ))}
          </div>
          {activePois.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap justify-end max-w-[500px]">
              {activePois.map((poi, i) => (
                <button
                  key={poi.name}
                  onClick={() => flyToPOI(poi)}
                  className={`text-[8px] font-mono px-2 py-0.5 border transition-all ${i === 0
                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-300"
                    : "bg-black/60 border-cyan-900/30 text-cyan-500/60 hover:border-cyan-500/40 hover:text-cyan-300"
                    }`}
                >
                  {poi.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Visual filter bar removed — overlapped city names and didn't provide real NVG/thermal */}

        {/* ═══ Corner brackets ═══ */}
        <div className="absolute top-8 left-2 w-5 h-5 border-l border-t border-cyan-500/20 pointer-events-none z-30" />
        <div className="absolute top-8 right-2 w-5 h-5 border-r border-t border-cyan-500/20 pointer-events-none z-30" />
        <div className="absolute bottom-2 left-2 w-5 h-5 border-l border-b border-cyan-500/20 pointer-events-none z-30" />
        <div className="absolute bottom-2 right-2 w-5 h-5 border-r border-b border-cyan-500/20 pointer-events-none z-30" />
      </div>

      <style>{`
        .cesium-viewer .cesium-widget-credits { display: none !important; }
        .cesium-viewer { font-family: 'JetBrains Mono', monospace; }
      `}</style>
    </GlobeErrorBoundary>
  );
}
