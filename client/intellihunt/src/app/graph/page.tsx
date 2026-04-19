"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchGraphStats,
  fetchGraphSoftware,
  fetchGraphNeighbors,
  type GraphStats,
  type GraphSoftware,
} from "@/lib/api";
import StatCard from "@/components/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/* ── Types for the interactive graph ── */
type GraphNode = {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
};

type GraphEdge = {
  from: string;
  to: string;
  type: string;
};

/* ── Node colors by type ── */
const NODE_COLORS: Record<string, string> = {
  Software: "#4a9eff",
  CVE: "#f04060",
  CWE: "#2d7ef8",
  ThreatActor: "#f08020",
  AttackTechnique: "#a855f7",
  CPE: "#5a7090",
  Advisory: "#10b981",
};

const NODE_RADIUS: Record<string, number> = {
  Software: 28,
  CVE: 24,
  CWE: 20,
  ThreatActor: 26,
  AttackTechnique: 22,
  CPE: 16,
  Advisory: 18,
};

/* ── Simple force-directed layout (canvas-based) ── */
function GraphCanvas({
  nodes,
  edges,
  onNodeClick,
  selectedId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  selectedId: string | null;
}) {
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || nodes.length === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width = canvas.offsetWidth * 2;
      const h = canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
      const cw = w / 2;
      const ch = h / 2;

      // Simple circular layout
      const positions = new Map<string, { x: number; y: number }>();
      const centerX = cw / 2;
      const centerY = ch / 2;
      const radius = Math.min(cw, ch) * 0.35;

      nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        positions.set(node.id, {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });

      // Clear
      ctx.fillStyle = "transparent";
      ctx.clearRect(0, 0, cw, ch);

      // Draw edges
      edges.forEach(edge => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "rgba(74, 158, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Edge label
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        ctx.font = "9px system-ui";
        ctx.fillStyle = "rgba(150, 170, 200, 0.5)";
        ctx.textAlign = "center";
        ctx.fillText(edge.type, mx, my - 4);
      });

      // Draw nodes
      nodes.forEach(node => {
        const pos = positions.get(node.id);
        if (!pos) return;

        const r = NODE_RADIUS[node.type] || 20;
        const color = NODE_COLORS[node.type] || "#5a7090";
        const isSelected = node.id === selectedId;

        // Glow
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 6, 0, 2 * Math.PI);
          ctx.fillStyle = color + "30";
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color + "20";
        ctx.fill();
        ctx.strokeStyle = isSelected ? color : color + "60";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Label
        ctx.font = "bold 10px system-ui";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = node.label.length > 14 ? node.label.slice(0, 12) + ".." : node.label;
        ctx.fillText(label, pos.x, pos.y);
      });

      // Click handler
      const handleClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);
        for (const node of nodes) {
          const pos = positions.get(node.id);
          if (!pos) continue;
          const r = NODE_RADIUS[node.type] || 20;
          const dx = x - pos.x;
          const dy = y - pos.y;
          if (dx * dx + dy * dy <= r * r) {
            onNodeClick(node);
            return;
          }
        }
      };

      canvas.onclick = handleClick;
    },
    [nodes, edges, selectedId, onNodeClick]
  );

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height: "420px", background: "var(--surface-inset)" }}
    />
  );
}

export default function GraphExplorerPage() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [software, setSoftware] = useState<GraphSoftware[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchGraphStats(), fetchGraphSoftware()])
      .then(([s, sw]) => {
        setStats(s);
        setSoftware(sw.software || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const expandNode = useCallback(async (nodeType: string, nodeId: string) => {
    try {
      const data = await fetchGraphNeighbors(nodeType, nodeId, 1);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch {
      // ignore
    }
  }, []);

  const handleSoftwareClick = (sw: GraphSoftware) => {
    const nodeId = `${sw.vendor}:${sw.product}:${sw.version || "*"}`;
    setSelected({ id: nodeId, label: sw.product, type: "Software" });
    expandNode("Software", nodeId);
  };

  const handleNodeClick = (node: GraphNode) => {
    setSelected(node);
    expandNode(node.type, node.id);
  };

  const filteredSoftware = software.filter(sw =>
    !filter ||
    sw.product.toLowerCase().includes(filter.toLowerCase()) ||
    sw.vendor.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading graph data...</span>
      </div>
    );
  }

  if (!stats?.connected) {
    return (
      <div className="p-6 space-y-4 max-w-[900px] mx-auto">
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          Knowledge Graph
        </h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              Knowledge graph is not connected. Ensure Neo4j is running.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const graphData = stats.graph || {};

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div>
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          Knowledge Graph
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
          Explore entities and relationships in your security knowledge graph.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Software"
          value={graphData.software_nodes ?? 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          }
        />
        <StatCard
          title="CVEs"
          value={graphData.cve_nodes ?? 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
          }
        />
        <StatCard
          title="Relationships"
          value={graphData.total_relationships ?? 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 016.364 6.364l-4.5 4.5a4.5 4.5 0 01-7.244-1.242" />
            </svg>
          }
        />
        <StatCard
          title="Wiki Pages"
          value={stats.wiki_pages ?? 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          }
        />
      </div>

      {/* Graph Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Software List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Software Stack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Filter software..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="mb-3"
            />
            <div className="space-y-1 max-h-[350px] overflow-y-auto">
              {filteredSoftware.length === 0 ? (
                <p className="text-[12px] py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  No software in graph yet.
                </p>
              ) : (
                filteredSoftware.map((sw, i) => {
                  const isSelected =
                    selected?.id === `${sw.vendor}:${sw.product}:${sw.version || "*"}`;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSoftwareClick(sw)}
                      className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-all duration-100"
                      style={{
                        color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                        background: isSelected ? "var(--accent-subtle)" : "transparent",
                        border: isSelected
                          ? "1px solid var(--accent-border)"
                          : "1px solid transparent",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected)
                          (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected)
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <span className="font-medium">{sw.product}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}
                        {sw.vendor} {sw.version && sw.version !== "*" ? `(${sw.version})` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Graph Canvas */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Graph Explorer</CardTitle>
            {selected && (
              <Badge variant="accent">{selected.type}: {selected.label}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {nodes.length > 0 ? (
              <GraphCanvas
                nodes={nodes}
                edges={edges}
                onNodeClick={handleNodeClick}
                selectedId={selected?.id ?? null}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ height: "420px", background: "var(--surface-inset)" }}
              >
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Select a software node to explore its neighborhood.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: color, opacity: 0.7 }}
            />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
