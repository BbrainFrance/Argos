"use client";

import { IntelFeedItem } from "@/types";

interface IntelFeedPanelProps {
  items: IntelFeedItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  geopolitics: "text-blue-400",
  defense: "text-red-400",
  intelligence: "text-purple-400",
  cyber: "text-emerald-400",
  terrorism: "text-orange-400",
  nuclear: "text-yellow-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export default function IntelFeedPanel({ items }: IntelFeedPanelProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 bg-argos-accent rounded-full" />
        <p className="text-[10px] font-mono text-argos-text-dim uppercase tracking-widest">
          Flux Renseignement ({items.length})
        </p>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {items.slice(0, 30).map((item) => (
          <a
            key={item.id}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-2 py-1.5 rounded hover:bg-argos-panel/50 border border-transparent hover:border-argos-border/20 transition-all group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono text-argos-text truncate group-hover:text-argos-accent transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[8px] font-mono uppercase ${CATEGORY_COLORS[item.categories[0]] ?? "text-argos-text-dim"}`}>
                    {item.feedName}
                  </span>
                  <span className="text-[8px] font-mono text-argos-text-dim/40">
                    {item.pubDate ? timeAgo(item.pubDate) : ""}
                  </span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
