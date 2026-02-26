"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { DashboardStats, Alert, AnalysisResult, Entity } from "@/types";
import type { ParsedAction } from "@/lib/mistral-tools";

interface CommandCenterProps {
  stats: DashboardStats;
  alerts: Alert[];
  analyses: AnalysisResult[];
  entities: Entity[];
  selectedEntity: Entity | null;
  onAction: (actions: ParsedAction[]) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ParsedAction[];
  timestamp: Date;
}

export default function CommandCenter({ stats, alerts, analyses, entities, selectedEntity, onAction }: CommandCenterProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId] = useState(`conv-${Date.now()}`);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const bestVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        setVoiceSupported(true);
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "fr-FR";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          setListening(false);
          handleSend(transcript);
        };

        recognition.onerror = () => setListening(false);
        recognition.onend = () => setListening(false);

        recognitionRef.current = recognition;
      }
      synthRef.current = window.speechSynthesis;

      const pickBestVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const fr = voices.filter((v) => v.lang.startsWith("fr"));
        if (fr.length === 0) return;
        const priority = ["Microsoft Denise", "Microsoft Claude", "Microsoft Julie", "Google français", "Amelie", "Thomas"];
        for (const name of priority) {
          const found = fr.find((v) => v.name.includes(name));
          if (found) { bestVoiceRef.current = found; return; }
        }
        const online = fr.find((v) => !v.localService);
        bestVoiceRef.current = online ?? fr[0];
      };

      pickBestVoice();
      window.speechSynthesis.addEventListener("voiceschanged", pickBestVoice);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", pickBestVoice);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/[*#_\[\]]/g, "").slice(0, 500);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    if (bestVoiceRef.current) utterance.voice = bestVoiceRef.current;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    synthRef.current.speak(utterance);
  }, []);

  const buildContext = useCallback(() => {
    const entityList = entities
      .filter((e) => e.position)
      .slice(0, 50)
      .map((e) => `${e.label} (${e.type}) ${e.position!.lat.toFixed(2)}N ${e.position!.lng.toFixed(2)}E${e.tracked ? " [SUIVI]" : ""}${e.flagged ? " [SIGNALE]" : ""}`)
      .join("\n");

    const alertSummary = alerts
      .filter((a) => !a.acknowledged)
      .slice(0, 10)
      .map((a) => `[${a.type}] ${a.title}: ${a.message}`)
      .join("\n");

    const statsStr = `Aeronefs: ${stats.totalAircraft} (${stats.activeFlights} en vol) | Navires: ${stats.totalVessels} | Alertes: ${stats.activeAlerts} | Suivis: ${stats.trackedEntities}`;

    return { entityList, alertSummary, stats: statsStr };
  }, [entities, alerts, stats]);

  const handleSend = useCallback(async (text?: string) => {
    const cmd = text ?? input.trim();
    if (!cmd) return;

    setInput("");
    setMessages((p) => [...p, { role: "user", content: cmd, timestamp: new Date() }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          conversationId,
          context: buildContext(),
        }),
      });

      const data = await res.json();
      const msg: ChatMessage = {
        role: "assistant",
        content: data.message || data.error || "Erreur inconnue",
        actions: data.actions,
        timestamp: new Date(),
      };
      setMessages((p) => [...p, msg]);

      if (data.actions && data.actions.length > 0) {
        onAction(data.actions);
      }

      speak(data.message || "Action executee.");
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "[ERREUR] Communication avec le module IA impossible", timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }, [input, conversationId, buildContext, onAction, speak]);

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognitionRef.current.start();
    }
  }, [listening]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="glass-panel p-3 w-full flex items-center justify-between hover:border-violet-500/40 transition-all"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-[10px] font-mono text-violet-400 tracking-widest uppercase">ARGOS COMMAND</span>
        </div>
        <div className="flex items-center gap-2">
          {voiceSupported && <span className="text-[9px] text-argos-text-dim/40">🎤</span>}
          <span className="text-[9px] text-argos-text-dim/40">▼</span>
        </div>
      </button>
    );
  }

  return (
    <div className="glass-panel flex flex-col" style={{ maxHeight: "50vh" }}>
      <div className="p-2 border-b border-argos-border/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${listening ? "bg-red-500" : "bg-violet-500"} animate-pulse`} />
          <span className="text-[10px] font-mono text-violet-400 tracking-widest uppercase">
            {listening ? "ECOUTE..." : "ARGOS COMMAND"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[8px] font-mono text-argos-text-dim/40 hover:text-red-400 px-1"
            >
              CLEAR
            </button>
          )}
          <button onClick={() => setExpanded(false)} className="text-argos-text-dim/60 hover:text-argos-text text-xs px-1">▲</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        {messages.length === 0 && !loading && (
          <div className="text-center py-4">
            <p className="text-[9px] font-mono text-argos-text-dim/40">
              Centre de commandement IA pret.
            </p>
            <p className="text-[8px] font-mono text-argos-text-dim/30 mt-1">
              Tapez ou utilisez la commande vocale.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg ${
              msg.role === "user"
                ? "bg-violet-500/10 border border-violet-500/30"
                : "bg-argos-bg/60 border border-argos-border/30"
            }`}>
              <p className="text-[10px] font-mono text-argos-text/90 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-argos-border/20 space-y-0.5">
                  {msg.actions.map((a, j) => (
                    <div key={j} className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-emerald-500" />
                      <span className="text-[8px] font-mono text-emerald-400">{a.type.replace("_", " ").toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[7px] font-mono text-argos-text-dim/30 mt-1">{msg.timestamp.toLocaleTimeString("fr-FR")}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-3 h-3 border border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            <span className="text-[9px] font-mono text-violet-400 animate-pulse">TRAITEMENT...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="p-2 border-t border-argos-border/30 flex gap-1.5 flex-shrink-0">
        {voiceSupported && (
          <button
            onClick={toggleVoice}
            className={`px-2.5 py-2 rounded text-sm transition-all flex-shrink-0 ${
              listening
                ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
                : "bg-argos-bg border border-argos-border/30 text-argos-text-dim hover:text-argos-accent hover:border-argos-accent/40"
            }`}
          >
            🎤
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={listening ? "Parlez maintenant..." : "Commande operateur..."}
          disabled={loading || listening}
          className="flex-1 px-3 py-2 bg-argos-bg border border-argos-border/30 rounded text-[10px] font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="px-3 py-2 text-[9px] font-mono uppercase rounded bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-all disabled:opacity-30 flex-shrink-0"
        >
          →
        </button>
      </div>
    </div>
  );
}
