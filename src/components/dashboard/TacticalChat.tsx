"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TacticalMessage } from "@/types";

interface TacticalChatProps {
  operatorName: string;
}

const PRIORITY_STYLES: Record<string, { border: string; text: string; badge: string }> = {
  routine: { border: "border-argos-border/30", text: "text-argos-text/80", badge: "" },
  priority: { border: "border-yellow-500/40", text: "text-yellow-300", badge: "bg-yellow-500/20 text-yellow-400" },
  flash: { border: "border-red-500/40", text: "text-red-300", badge: "bg-red-500/20 text-red-400" },
};

export default function TacticalChat({ operatorName }: TacticalChatProps) {
  const [messages, setMessages] = useState<TacticalMessage[]>([]);
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<"routine" | "priority" | "flash">("routine");
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const sinceParam = lastFetchRef.current ? `&since=${lastFetchRef.current}` : "";
      const res = await fetch(`/api/tactical-chat?channel=general${sinceParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages
            .filter((m: TacticalMessage) => !existingIds.has(m.id))
            .map((m: TacticalMessage & { timestamp: string }) => ({ ...m, timestamp: new Date(m.timestamp) }));
          if (newMsgs.length > 0 && !expanded) setUnread((u) => u + newMsgs.length);
          return [...prev, ...newMsgs].slice(-100);
        });
        const last = data.messages[data.messages.length - 1];
        if (last) lastFetchRef.current = last.timestamp;
      }
    } catch { /* polling error, retry next tick */ }
  }, [expanded]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (expanded) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnread(0);
    }
  }, [messages, expanded]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    try {
      await fetch("/api/tactical-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: operatorName, content: text, priority }),
      });
      fetchMessages();
    } catch { /* best effort */ }
  }, [input, priority, operatorName, fetchMessages]);

  if (!expanded) {
    return (
      <button
        onClick={() => { setExpanded(true); setUnread(0); }}
        className="glass-panel p-3 w-full flex items-center justify-between hover:border-emerald-500/40 transition-all"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400 tracking-widest uppercase">CANAL TACTIQUE</span>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <span className="px-1.5 py-0.5 text-[8px] font-mono bg-red-500/20 text-red-400 rounded-full">{unread}</span>
          )}
          <span className="text-[9px] text-argos-text-dim/40">▼</span>
        </div>
      </button>
    );
  }

  return (
    <div className="glass-panel flex flex-col" style={{ maxHeight: "40vh" }}>
      <div className="p-2 border-b border-argos-border/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400 tracking-widest uppercase">CANAL TACTIQUE</span>
          <span className="text-[8px] font-mono text-argos-text-dim/40">#{messages.length}</span>
        </div>
        <button onClick={() => setExpanded(false)} className="text-argos-text-dim/60 hover:text-argos-text text-xs px-1">▲</button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[80px]">
        {messages.length === 0 && (
          <p className="text-[9px] font-mono text-argos-text-dim/40 text-center py-4">Aucun message</p>
        )}
        {messages.map((msg) => {
          const style = PRIORITY_STYLES[msg.priority] || PRIORITY_STYLES.routine;
          const isOwn = msg.sender === operatorName;
          return (
            <div key={msg.id} className={`px-2 py-1.5 rounded border ${style.border} ${isOwn ? "bg-emerald-500/5" : "bg-argos-bg/40"}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[8px] font-mono font-bold ${isOwn ? "text-emerald-400" : "text-argos-accent"}`}>{msg.sender}</span>
                {msg.priority !== "routine" && (
                  <span className={`text-[7px] font-mono uppercase px-1 rounded ${style.badge}`}>{msg.priority}</span>
                )}
                <span className="text-[7px] font-mono text-argos-text-dim/30 ml-auto">
                  {new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              <p className={`text-[9px] font-mono ${style.text} leading-relaxed`}>{msg.content}</p>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="p-2 border-t border-argos-border/30 space-y-1.5 flex-shrink-0">
        <div className="flex gap-1">
          {(["routine", "priority", "flash"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-2 py-0.5 text-[7px] font-mono uppercase rounded border transition-all ${
                priority === p
                  ? p === "flash" ? "border-red-500 text-red-400 bg-red-500/10"
                    : p === "priority" ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                    : "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                  : "border-argos-border/30 text-argos-text-dim/50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
            placeholder="Message tactique..."
            className="flex-1 px-3 py-2 bg-argos-bg border border-argos-border/30 rounded text-[10px] font-mono text-argos-text placeholder:text-argos-text-dim/30 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-2 text-[9px] font-mono uppercase rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-30 flex-shrink-0"
          >
            TX
          </button>
        </div>
      </div>
    </div>
  );
}
