import { NextRequest, NextResponse } from "next/server";
import { geolocatePhoto } from "@/lib/photo-geolocation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Type de fichier non supporté: ${file.type}. Formats acceptés: JPEG, PNG, WebP, TIFF` },
        { status: 400 }
      );
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 20 Mo)" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const result = await geolocatePhoto(buffer, file.type);

    if (!result) {
      return NextResponse.json(
        {
          error: "Impossible de géolocaliser cette image. Aucune donnée GPS dans les métadonnées EXIF et l'analyse IA n'a pas pu déterminer l'emplacement.",
          fileName: file.name,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Photo geolocation error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
