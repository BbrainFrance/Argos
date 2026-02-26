"use client";

import { useState, useRef, useCallback } from "react";

interface PhotoResult {
  lat: number;
  lng: number;
  confidence: "high" | "medium" | "low";
  method: "exif" | "ai_vision";
  fileName: string;
  details: {
    exifDate?: string;
    exifCamera?: string;
    aiDescription?: string;
    aiReasoning?: string;
  };
}

interface PhotoUploadPanelProps {
  onGeolocated: (result: PhotoResult) => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400 bg-green-500/10 border-green-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function PhotoUploadPanel({ onGeolocated }: PhotoUploadPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    try {
      const form = new FormData();
      form.append("photo", file);

      const res = await fetch("/api/photo-geolocation", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur inconnue");
        return;
      }

      const photoResult: PhotoResult = {
        lat: data.lat,
        lng: data.lng,
        confidence: data.confidence,
        method: data.method,
        fileName: data.fileName,
        details: data.details,
      };

      setResult(photoResult);
      onGeolocated(photoResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setUploading(false);
    }
  }, [onGeolocated]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-3 bg-argos-accent rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          GeoINT — Upload Photo
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-lg p-4 text-center transition-all ${
          dragging
            ? "border-argos-accent bg-argos-accent/5"
            : "border-argos-border/30 hover:border-argos-accent/50 hover:bg-argos-panel/30"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/tiff"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="text-2xl mb-1">📸</div>
        <p className="text-[10px] font-mono text-argos-text-dim">
          Glissez une image ou cliquez pour selectionner
        </p>
        <p className="text-[8px] font-mono text-argos-text-dim/50 mt-1">
          JPEG, PNG, WebP, TIFF — Max 20 Mo
        </p>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-argos-accent/5 border border-argos-accent/20">
          <div className="w-3 h-3 border-2 border-argos-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-[9px] font-mono text-argos-accent">
            Analyse en cours... Extraction EXIF puis IA si necessaire
          </p>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded bg-red-500/5 border border-red-500/20">
          <p className="text-[9px] font-mono text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {preview && (
            <div className="rounded overflow-hidden border border-argos-border/20 max-h-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Uploaded" className="w-full h-32 object-cover" />
            </div>
          )}

          <div className="px-3 py-2 rounded bg-argos-panel/50 border border-argos-border/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-argos-text-dim">Fichier</span>
              <span className="text-[9px] font-mono text-argos-text truncate max-w-[60%]">{result.fileName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-argos-text-dim">Methode</span>
              <span className="text-[9px] font-mono text-argos-text">
                {result.method === "exif" ? "GPS EXIF" : "IA Mistral Pixtral"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-argos-text-dim">Confiance</span>
              <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[result.confidence]}`}>
                {result.confidence.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-argos-text-dim">Position</span>
              <span className="text-[9px] font-mono text-argos-accent">
                {result.lat.toFixed(5)}°N {result.lng.toFixed(5)}°E
              </span>
            </div>
            {result.details.exifDate && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-argos-text-dim">Date prise</span>
                <span className="text-[9px] font-mono text-argos-text">{result.details.exifDate}</span>
              </div>
            )}
            {result.details.exifCamera && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-argos-text-dim">Appareil</span>
                <span className="text-[9px] font-mono text-argos-text">{result.details.exifCamera}</span>
              </div>
            )}
          </div>

          {result.details.aiDescription && (
            <div className="px-3 py-2 rounded bg-purple-500/5 border border-purple-500/10">
              <p className="text-[8px] font-mono text-purple-400 uppercase tracking-wider mb-1">Analyse IA</p>
              <p className="text-[9px] font-mono text-argos-text leading-relaxed">{result.details.aiDescription}</p>
              {result.details.aiReasoning && (
                <p className="text-[8px] font-mono text-argos-text-dim mt-1 leading-relaxed">{result.details.aiReasoning}</p>
              )}
            </div>
          )}

          <button
            onClick={() => { setResult(null); setPreview(null); setError(null); }}
            className="w-full text-[9px] font-mono py-1.5 rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-accent hover:border-argos-accent/30 transition-all"
          >
            NOUVELLE ANALYSE
          </button>
        </div>
      )}
    </div>
  );
}
