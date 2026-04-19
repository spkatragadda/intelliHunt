"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchWikiIndex,
  searchWiki,
  fetchWikiLog,
  type WikiPageSummary,
  type WikiLogEntry,
} from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ENTITY_TYPES = ["all", "software", "cve", "cwe", "threat_actor"] as const;

const TYPE_LABELS: Record<string, string> = {
  all: "All",
  software: "Software",
  cve: "CVEs",
  cwe: "CWEs",
  threat_actor: "Threat Actors",
};

const TYPE_BADGE_VARIANT: Record<string, "default" | "critical" | "medium" | "warning" | "accent"> = {
  software: "accent",
  cve: "critical",
  cwe: "medium",
  threat_actor: "warning",
};

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WikiPage() {
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [log, setLog] = useState<WikiLogEntry[]>([]);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadPages = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const data = await fetchWikiIndex(type === "all" ? undefined : type);
      setPages(data.pages || []);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = useCallback(async () => {
    if (!search.trim()) {
      loadPages(tab);
      return;
    }
    setLoading(true);
    try {
      const data = await searchWiki(search);
      setPages(data.results || []);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [search, tab, loadPages]);

  useEffect(() => {
    loadPages(tab);
    fetchWikiLog().then(d => setLog(d.entries || [])).catch(() => {});
  }, [tab, loadPages]);

  useEffect(() => {
    const timeout = setTimeout(doSearch, 400);
    return () => clearTimeout(timeout);
  }, [search, doSearch]);

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            Knowledge Wiki
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            LLM-maintained vulnerability intelligence pages backed by the knowledge graph.
          </p>
        </div>
        <Badge variant="accent">{pages.length} pages</Badge>
      </div>

      {/* Search */}
      <Input
        placeholder="Search wiki pages..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => { setTab(v); setSearch(""); }}>
        <TabsList>
          {ENTITY_TYPES.map(t => (
            <TabsTrigger key={t} value={t}>{TYPE_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>

        {ENTITY_TYPES.map(t => (
          <TabsContent key={t} value={t}>
            {loading ? (
              <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                Loading pages...
              </div>
            ) : pages.length === 0 ? (
              <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                {search ? "No results found." : "No wiki pages yet. Run a scan to populate the knowledge graph."}
              </div>
            ) : (
              <div className="grid gap-3 mt-4">
                {pages.map(page => (
                  <Link key={page.id} href={`/wiki/${page.entity_type}/${encodeURIComponent(page.entity_id)}`}>
                    <Card
                      className="transition-all duration-150 cursor-pointer"
                      style={{ borderColor: "var(--border)" }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.transform = "none";
                      }}
                    >
                      <CardContent className="flex items-center justify-between py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant={TYPE_BADGE_VARIANT[page.entity_type] || "default"}>
                            {page.entity_type}
                          </Badge>
                          <span
                            className="text-[14px] font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {page.title}
                          </span>
                        </div>
                        <span className="text-[11px] flex-shrink-0 ml-4" style={{ color: "var(--text-muted)" }}>
                          {timeSince(page.last_refreshed)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Recent Activity */}
      {log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Wiki Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {log.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-[12.5px]">
                <Badge variant={entry.operation === "ingest" ? "success" : entry.operation === "lint" ? "warning" : "secondary"}>
                  {entry.operation}
                </Badge>
                <span style={{ color: "var(--text-secondary)" }}>{entry.title}</span>
                <span className="ml-auto flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  {timeSince(entry.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
