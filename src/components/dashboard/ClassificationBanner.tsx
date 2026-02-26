"use client";

import { useState } from "react";
import type { ClassificationLevel } from "@/lib/classification";
import { getClassification, getAllClassifications, canExportAtLevel } from "@/lib/classification";

interface ClassificationBannerProps {
  level: ClassificationLevel;
  onLevelChange?: (level: ClassificationLevel) => void;
  editable?: boolean;
}

export default function ClassificationBanner({ level, onLevelChange, editable = false }: ClassificationBannerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const meta = getClassification(level);

  return (
    <>
      {/* Top banner */}
      <div
        className="w-full text-center py-0.5 text-[7px] font-mono font-bold tracking-widest cursor-default select-none relative z-50"
        style={{ backgroundColor: meta.color, color: meta.pdfTextColor.join(",") === "0,0,0" ? "#000" : "#fff" }}
        onClick={() => editable && setShowPicker(!showPicker)}
        title={editable ? "Cliquer pour modifier la classification" : meta.bannerText}
      >
        {meta.bannerText}
        {editable && <span className="ml-2 opacity-60">▼</span>}
      </div>

      {showPicker && editable && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[9999] bg-[#0d1117] border border-white/10 rounded shadow-2xl p-1 min-w-[200px]">
          {getAllClassifications().map((c) => (
            <button
              key={c.level}
              onClick={() => {
                onLevelChange?.(c.level);
                setShowPicker(false);
              }}
              className={`w-full text-left px-2 py-1 text-[8px] font-mono rounded flex items-center gap-2 transition-colors ${
                c.level === level
                  ? "bg-white/10 text-white"
                  : "text-argos-text-dim/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              <span className="font-bold">{c.shortLabel}</span>
              <span className="text-[7px] opacity-60">{c.label}</span>
              {!c.canExport && <span className="ml-auto text-[6px] text-red-400">NO EXPORT</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function ClassificationFooter({ level }: { level: ClassificationLevel }) {
  const meta = getClassification(level);
  return (
    <div
      className="w-full text-center py-0.5 text-[6px] font-mono tracking-widest select-none"
      style={{ backgroundColor: meta.color, color: meta.pdfTextColor.join(",") === "0,0,0" ? "#000" : "#fff" }}
    >
      {meta.shortLabel} — ARGOS SOUVERAIN
    </div>
  );
}

export function useClassificationGuard(level: ClassificationLevel) {
  return {
    canExport: canExportAtLevel(level),
    requiresEncryption: getClassification(level).requiresEncryption,
    handlingRules: getClassification(level).handlingRules,
  };
}
