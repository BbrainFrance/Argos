"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TimelineProps {
  onTimeChange: (timestamp: number | null) => void;
  isActive: boolean;
  onToggle: () => void;
}

const THROTTLE_MS = 2000;

export default function Timeline({ onTimeChange, isActive, onToggle }: TimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [startTime] = useState(() => Date.now() - 3600_000);
  const [endTime] = useState(() => Date.now());
  const [speed, setSpeed] = useState(10);
  const animFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef(Date.now());
  const lastEmitRef = useRef(0);

  const progress = Math.max(0, Math.min(1, (currentTime - startTime) / (endTime - startTime)));

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      const ts = startTime + val * (endTime - startTime);
      setCurrentTime(ts);
      if (isActive) onTimeChange(ts);
    },
    [startTime, endTime, isActive, onTimeChange]
  );

  useEffect(() => {
    if (!playing || !isActive) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    lastTickRef.current = Date.now();

    function tick() {
      const now = Date.now();
      const delta = (now - lastTickRef.current) * speed;
      lastTickRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= endTime) {
          setPlaying(false);
          onTimeChange(endTime);
          return endTime;
        }
        if (now - lastEmitRef.current >= THROTTLE_MS) {
          lastEmitRef.current = now;
          onTimeChange(next);
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playing, isActive, speed, endTime, onTimeChange]);

  useEffect(() => {
    if (!isActive) {
      setPlaying(false);
      onTimeChange(null);
    }
  }, [isActive, onTimeChange]);

  return (
    <div className="bg-argos-surface/80 backdrop-blur-sm border-t border-argos-border/30 px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`text-[9px] font-mono px-2 py-1 rounded border transition-all ${
            isActive
              ? "bg-argos-accent/10 border-argos-accent/40 text-argos-accent"
              : "border-argos-border/30 text-argos-text-dim hover:text-argos-accent"
          }`}
        >
          {isActive ? "LIVE" : "HISTORIQUE"}
        </button>

        {isActive && (
          <>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="text-sm px-1.5 py-0.5 rounded border border-argos-border/30 text-argos-text-dim hover:text-argos-accent transition-all"
            >
              {playing ? "⏸" : "▶"}
            </button>

            <span className="text-[9px] font-mono text-argos-text-dim/60 tabular-nums w-12">
              {formatTime(startTime)}
            </span>

            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress}
                onChange={handleSliderChange}
                className="w-full h-1 appearance-none bg-argos-border/30 rounded-full outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-argos-accent [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,212,255,0.5)]"
              />
              <div
                className="absolute top-0 left-0 h-1 bg-argos-accent/40 rounded-full pointer-events-none"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <span className="text-[9px] font-mono text-argos-text-dim/60 tabular-nums w-12 text-right">
              {formatTime(endTime)}
            </span>

            <div className="flex items-center gap-1">
              <span className="text-[8px] font-mono text-argos-text-dim/40">x</span>
              {[1, 5, 10, 30].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-[8px] font-mono px-1.5 py-0.5 rounded transition-all ${
                    speed === s
                      ? "bg-argos-accent/20 text-argos-accent border border-argos-accent/30"
                      : "text-argos-text-dim/40 hover:text-argos-text-dim border border-transparent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <span className="text-[10px] font-mono text-argos-accent tabular-nums font-semibold w-14 text-right">
              {formatTime(currentTime)}
            </span>
          </>
        )}

        {!isActive && (
          <span className="text-[9px] font-mono text-argos-text-dim/40">
            Basculez en mode historique pour rejouer les mouvements
          </span>
        )}
      </div>
    </div>
  );
}
