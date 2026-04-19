"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import {
  fetchWikiPage,
  refreshWikiPage,
  type WikiPageDetail,
} from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_BADGE_VARIANT: Record<string, "default" | "critical" | "medium" | "warning" | "accent"> = {
  software: "accent",
  cve: "critical",
  cwe: "medium",
  threat_actor: "warning",
};

export default function WikiPageDetail() {
  const params = useParams();
  const router = useRouter();
  const entityType = params.entityType as string;
  const entityId = decodeURIComponent(params.entityId as string);

  const [page, setPage] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchWikiPage(entityType, entityId);
      setPage(data);
    } catch {
      setError("Wiki page not found.");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshWikiPage(entityType, entityId);
      await load();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading...</span>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="p-6 space-y-4 max-w-[900px] mx-auto">
        <button
          onClick={() => router.push("/wiki")}
          className="text-[13px] flex items-center gap-1.5"
          style={{ color: "var(--accent)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Wiki
        </button>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>{error || "Page not found"}</p>
            <p className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              Run a scan or trigger a graph sync to generate this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[900px] mx-auto">
      {/* Back + Header */}
      <button
        onClick={() => router.push("/wiki")}
        className="text-[13px] flex items-center gap-1.5"
        style={{ color: "var(--accent)" }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Wiki
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant={TYPE_BADGE_VARIANT[entityType] || "default"}>{entityType}</Badge>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Updated {timeSince(page.last_refreshed)}
            </span>
          </div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            {page.title}
          </h1>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Wiki Content */}
      <Card>
        <CardContent
          className="prose prose-invert max-w-none
            prose-headings:font-display prose-headings:tracking-tight
            prose-h2:text-[16px] prose-h2:mt-8 prose-h2:mb-3
            prose-h3:text-[14px] prose-h3:mt-6 prose-h3:mb-2
            prose-p:text-[13.5px] prose-p:leading-relaxed
            prose-li:text-[13.5px]
            prose-code:text-[12px] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-table:text-[12.5px]
            prose-th:text-left prose-th:px-3 prose-th:py-2
            prose-td:px-3 prose-td:py-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <ReactMarkdown>{page.content_markdown}</ReactMarkdown>
        </CardContent>
      </Card>

      {/* Interlinks */}
      {page.links_to && page.links_to.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Pages</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {page.links_to.map(link => {
              // links_to contains entity_ids like "CVE-2024-1234" or "apache:httpd:2.4"
              const isCve = link.startsWith("CVE-");
              const type = isCve ? "cve" : "software";
              return (
                <Link key={link} href={`/wiki/${type}/${encodeURIComponent(link)}`}>
                  <Badge
                    variant={isCve ? "critical" : "accent"}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {link}
                  </Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
