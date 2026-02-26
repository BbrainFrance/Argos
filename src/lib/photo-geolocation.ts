/**
 * Photo Geolocation — Extract GPS from EXIF or estimate via Mistral Pixtral vision.
 * Priorite: EXIF GPS → Mistral Pixtral
 */

import ExifReader from "exifreader";
import { withCircuitBreaker } from "./circuit-breaker";

const MISTRAL_API = "https://api.mistral.ai/v1/chat/completions";
const VISION_MODEL = "pixtral-large-latest";

export interface PhotoGeolocationResult {
  lat: number;
  lng: number;
  confidence: "high" | "medium" | "low";
  method: "exif" | "ai_vision";
  details: {
    exifDate?: string;
    exifCamera?: string;
    exifOrientation?: string;
    aiDescription?: string;
    aiReasoning?: string;
  };
}

interface ExifGPSData {
  lat: number | null;
  lng: number | null;
  date: string | null;
  camera: string | null;
  orientation: string | null;
}

export function extractEXIF(buffer: ArrayBuffer): ExifGPSData {
  try {
    const tags = ExifReader.load(buffer, { expanded: true });

    let lat: number | null = null;
    let lng: number | null = null;

    if (tags.gps?.Latitude != null && tags.gps?.Longitude != null) {
      lat = tags.gps.Latitude;
      lng = tags.gps.Longitude;
    }

    const dateTag =
      tags.exif?.DateTimeOriginal?.description ??
      tags.exif?.DateTime?.description ??
      null;

    const make = tags.exif?.Make?.description ?? "";
    const model = tags.exif?.Model?.description ?? "";
    const camera = [make, model].filter(Boolean).join(" ") || null;

    const orientation = tags.exif?.Orientation?.description ?? null;

    return { lat, lng, date: dateTag, camera, orientation };
  } catch (e) {
    console.warn("EXIF extraction failed:", e);
    return { lat: null, lng: null, date: null, camera: null, orientation: null };
  }
}

export async function geolocateWithVision(
  base64Image: string,
  mimeType: string
): Promise<{ lat: number; lng: number; description: string; reasoning: string } | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY non configurée");
  }

  const prompt = `Tu es un expert en géolocalisation d'images (GEOINT). Analyse cette image et essaie de déterminer l'emplacement géographique précis.

Indices à analyser :
- Architecture (style, matériaux, typique de quelle région)
- Panneaux, enseignes, textes visibles (langue, format)
- Végétation (type, saison)
- Véhicules (plaques, modèles)
- Infrastructure routière (type de routes, signalisation)
- Paysage, relief, climat apparent
- Tout autre indice géographique

Réponds STRICTEMENT dans ce format JSON :
{
  "lat": <latitude décimale ou null si impossible>,
  "lng": <longitude décimale ou null si impossible>,
  "confidence": "<high|medium|low>",
  "description": "<description courte de ce que tu vois>",
  "reasoning": "<explication de ton raisonnement géographique>"
}

Si tu ne peux pas déterminer de localisation, renvoie lat et lng à null.`;

  const res = await withCircuitBreaker("mistral-vision", () =>
    fetch(MISTRAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    })
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`Mistral Vision API error ${res.status}:`, err.slice(0, 200));
    return null;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    if (parsed.lat != null && parsed.lng != null && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        description: parsed.description ?? "",
        reasoning: parsed.reasoning ?? "",
      };
    }
    return null;
  } catch {
    console.warn("Failed to parse Mistral Vision response:", content.slice(0, 200));
    return null;
  }
}

export async function geolocatePhoto(buffer: ArrayBuffer, mimeType: string): Promise<PhotoGeolocationResult | null> {
  const exif = extractEXIF(buffer);

  if (exif.lat != null && exif.lng != null) {
    return {
      lat: exif.lat,
      lng: exif.lng,
      confidence: "high",
      method: "exif",
      details: {
        exifDate: exif.date ?? undefined,
        exifCamera: exif.camera ?? undefined,
        exifOrientation: exif.orientation ?? undefined,
      },
    };
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const visionResult = await geolocateWithVision(base64, mimeType);

  if (visionResult) {
    return {
      lat: visionResult.lat,
      lng: visionResult.lng,
      confidence: "medium",
      method: "ai_vision",
      details: {
        exifDate: exif.date ?? undefined,
        exifCamera: exif.camera ?? undefined,
        aiDescription: visionResult.description,
        aiReasoning: visionResult.reasoning,
      },
    };
  }

  return null;
}
