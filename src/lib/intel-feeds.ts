import { IntelFeedItem } from "@/types";
import { withCircuitBreaker } from "./circuit-breaker";
import { getCached } from "./cache";

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  category: "geopolitics" | "defense" | "intelligence" | "cyber" | "terrorism" | "nuclear";
}

const INTEL_FEEDS: FeedConfig[] = [
  {
    id: "reuters-world",
    name: "Reuters World",
    url: "https://feeds.reuters.com/reuters/worldNews",
    category: "geopolitics",
  },
  {
    id: "bbc-world",
    name: "BBC World",
    url: "http://feeds.bbci.co.uk/news/world/rss.xml",
    category: "geopolitics",
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "geopolitics",
  },
  {
    id: "janes",
    name: "Janes Defence",
    url: "https://www.janes.com/feeds/news",
    category: "defense",
  },
  {
    id: "defense-news",
    name: "Defense News",
    url: "https://www.defensenews.com/arc/outboundfeeds/rss/",
    category: "defense",
  },
  {
    id: "war-on-rocks",
    name: "War on the Rocks",
    url: "https://warontherocks.com/feed/",
    category: "defense",
  },
  {
    id: "bellingcat",
    name: "Bellingcat",
    url: "https://www.bellingcat.com/feed/",
    category: "intelligence",
  },
  {
    id: "the-diplomat",
    name: "The Diplomat",
    url: "https://thediplomat.com/feed/",
    category: "geopolitics",
  },
  {
    id: "foreign-affairs",
    name: "Foreign Affairs",
    url: "https://www.foreignaffairs.com/rss.xml",
    category: "geopolitics",
  },
  {
    id: "csis",
    name: "CSIS",
    url: "https://www.csis.org/analysis/feed",
    category: "intelligence",
  },
  {
    id: "iiss",
    name: "IISS",
    url: "https://www.iiss.org/rss",
    category: "defense",
  },
  {
    id: "nato-news",
    name: "NATO News",
    url: "https://www.nato.int/cps/en/natolive/news.htm?rss=true",
    category: "defense",
  },
  {
    id: "sipri",
    name: "SIPRI",
    url: "https://www.sipri.org/rss.xml",
    category: "defense",
  },
  {
    id: "icg",
    name: "Crisis Group",
    url: "https://www.crisisgroup.org/rss.xml",
    category: "geopolitics",
  },
  {
    id: "krebs-security",
    name: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    category: "cyber",
  },
  {
    id: "dark-reading",
    name: "Dark Reading",
    url: "https://www.darkreading.com/rss.xml",
    category: "cyber",
  },
  {
    id: "threat-post",
    name: "Threatpost",
    url: "https://threatpost.com/feed/",
    category: "cyber",
  },
  {
    id: "schneier",
    name: "Schneier on Security",
    url: "https://www.schneier.com/feed/atom/",
    category: "cyber",
  },
  {
    id: "france24-en",
    name: "France24",
    url: "https://www.france24.com/en/rss",
    category: "geopolitics",
  },
  {
    id: "lemonde-intl",
    name: "Le Monde International",
    url: "https://www.lemonde.fr/international/rss_full.xml",
    category: "geopolitics",
  },
];

function extractTag(xml: string, tagName: string): string {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return (m[1] || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractAttr(xml: string, tagName: string, attr: string): string {
  const re = new RegExp(`<${tagName}[^>]+${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

async function parseFeed(feed: FeedConfig): Promise<IntelFeedItem[]> {
  return withCircuitBreaker(`rss:${feed.id}`, async () => {
    const res = await fetch(feed.url);
    if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
    const xml = await res.text();

    const items: IntelFeedItem[] = [];
    const itemRegex = /<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    let count = 0;
    const maxItems = 20;

    while ((match = itemRegex.exec(xml)) !== null && count < maxItems) {
      const block = match[1];
      const title =
        extractTag(block, "title") ||
        extractTag(block, "atom:title");
      const link =
        extractTag(block, "link") ||
        extractAttr(block, "link", "href") ||
        extractTag(block, "atom:link");
      const pubDate =
        extractTag(block, "pubDate") ||
        extractTag(block, "published") ||
        extractTag(block, "updated") ||
        extractTag(block, "dc:date");
      const description =
        extractTag(block, "description") ||
        extractTag(block, "summary") ||
        extractTag(block, "content") ||
        extractTag(block, "atom:summary") ||
        extractTag(block, "atom:content");

      if (!title && !description) continue;

      items.push({
        id: `${feed.id}-${count}`,
        feedId: feed.id,
        feedName: feed.name,
        title: title || "(No title)",
        link: link || "",
        pubDate: pubDate || new Date().toISOString(),
        summary: description || "",
        categories: [feed.category],
        country: null,
        lat: null,
        lng: null,
        sentiment: null,
        relevanceScore: 50,
      });
      count++;
    }
    return items;
  });
}

export async function fetchIntelFeeds(categories?: string[]): Promise<IntelFeedItem[]> {
  const cacheKey = categories?.length
    ? `intel-feeds:${categories.sort().join(",")}`
    : "intel-feeds:all";

  return getCached(
    cacheKey,
    async () => {
      const feeds = categories?.length
        ? INTEL_FEEDS.filter((f) => categories.includes(f.category))
        : INTEL_FEEDS;

      const results = await Promise.allSettled(feeds.map(parseFeed));
      const all: IntelFeedItem[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") all.push(...r.value);
      }

      all.sort((a, b) => {
        const da = new Date(a.pubDate).getTime();
        const db = new Date(b.pubDate).getTime();
        return db - da;
      });
      return all;
    },
    { ttlSeconds: 900 }
  );
}
