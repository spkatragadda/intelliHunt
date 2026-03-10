"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCmdbIntegrations,
  saveCmdbIntegration,
  deleteCmdbIntegration,
  testCmdbConnection,
  importCmdbData,
  type CmdbIntegration,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/* ══════════════════════════════════════════
   Types
   ══════════════════════════════════════════ */
type ConnStatus   = "idle" | "testing" | "connected" | "error";
type ImportStatus = "idle" | "importing" | "done" | "error";

type CustomEntry = {
  id: string; name: string; endpoint: string;
  auth_type: "none" | "basic" | "bearer" | "api_key";
  username: string; password: string; token: string;
  key_header: string; api_key: string; last_synced?: string;
};

/* Shared styles removed — using Input/Select components from ui/ */

const PROVIDER_COLORS: Record<string, string> = {
  servicenow: "#62d84e", bmc_helix: "#e8742a",
  atlassian: "#2684ff",  custom: "#4a9eff",
};

/* ══════════════════════════════════════════
   Utility helpers
   ══════════════════════════════════════════ */
function timeSince(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function cardDisplayStatus(saved: boolean, connStatus: ConnStatus) {
  const map = {
    connected: { label: "Connected",      dot: "var(--success)",  bg: "var(--accent-muted)",        color: "var(--success)" },
    error:     { label: "Auth Failed",    dot: "var(--danger)",   bg: "rgba(248,113,113,0.10)",     color: "var(--danger)" },
    testing:   { label: "Testing…",      dot: "var(--warning)",  bg: "rgba(251,191,36,0.10)",      color: "var(--warning)" },
    idle:      saved
      ? { label: "Configured",    dot: "var(--accent)",  bg: "rgba(74,158,255,0.09)",       color: "var(--accent)" }
      : { label: "Not Configured", dot: "var(--text-muted)", bg: "rgba(74,100,160,0.07)", color: "var(--text-muted)" },
  };
  return map[connStatus];
}

/* ══════════════════════════════════════════
   FieldRow — form field with label (shadcn)
   ══════════════════════════════════════════ */
function FieldRow({ label, value, onChange, type = "text", placeholder, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: "text" | "password" | "select";
  placeholder?: string; options?: { value: string; label: string }[]; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {type === "select" && options ? (
        <Select value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : type === "password" ? (
        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder ?? "••••••••"}
            style={{ paddingRight: "2.5rem" }}
          />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded"
            style={{ color: "var(--text-muted)" }}>
            {show ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════
   ActionBtn — drawer CTA button (shadcn)
   ══════════════════════════════════════════ */
function ActionBtn({ onClick, disabled, variant = "secondary", children }: {
  onClick: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; children: React.ReactNode;
}) {
  const variantMap = { primary: "default", secondary: "secondary", danger: "destructive" } as const;
  return (
    <Button size="sm" onClick={onClick} disabled={disabled} variant={variantMap[variant]}>
      {children}
    </Button>
  );
}

/* ══════════════════════════════════════════
   StatusPill — inside drawer (shadcn Badge)
   ══════════════════════════════════════════ */
function StatusPill({ status, message }: { status: ConnStatus; message: string }) {
  const variantMap: Record<ConnStatus, "secondary" | "warning" | "success" | "destructive"> = {
    idle: "secondary", testing: "warning", connected: "success", error: "destructive",
  };
  const labels: Record<ConnStatus, string> = {
    idle: "Not tested", testing: "Testing…", connected: "Connected", error: "Error",
  };
  return (
    <Badge variant={variantMap[status]}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${status === "testing" ? "animate-pulse" : ""}`}
        style={{ background: "currentColor" }} />
      {status === "testing" ? "Testing…" : (message && status !== "idle" ? message.slice(0, 48) : labels[status])}
    </Badge>
  );
}

/* ══════════════════════════════════════════
   ImportPill — inside drawer
   ══════════════════════════════════════════ */
function ImportPill({ status, message }: { status: ImportStatus; message: string }) {
  if (status === "idle") return null;
  const map: Record<ImportStatus, { color: string; bg: string }> = {
    idle:      { color: "var(--text-muted)", bg: "transparent" },
    importing: { color: "var(--warning)",    bg: "rgba(251,191,36,0.08)"  },
    done:      { color: "var(--success)",    bg: "var(--accent-subtle)"   },
    error:     { color: "var(--danger)",     bg: "rgba(248,113,113,0.08)" },
  };
  const s = map[status];
  return (
    <div className="text-[12px] px-3 py-2 rounded-md" style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}>
      {status === "importing" ? "Importing CMDB data…" : message}
    </div>
  );
}

/* ══════════════════════════════════════════
   Drawer — right-side sheet
   ══════════════════════════════════════════ */
function Drawer({ open, onClose, title, subtitle, icon, accentColor, children }: {
  open: boolean; onClose: () => void;
  title: string; subtitle?: string;
  icon: React.ReactNode; accentColor: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(2,6,23,0.7)",
          backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
        width: "min(500px, 100vw)",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Accent stripe */}
        <div style={{ height: "3px", background: accentColor, flexShrink: 0 }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: `${accentColor}1a`, border: `1px solid ${accentColor}35` }}>
              {icon}
            </div>
            <div>
              <p className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{title}</p>
              {subtitle && <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose}
            className="rounded-md p-2 transition-all duration-150"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {children}
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   MarketplaceCard — compact grid card
   ══════════════════════════════════════════ */
function MarketplaceCard({ accentColor, icon, name, description, connStatus, saved, lastSynced, onClick }: {
  accentColor: string; icon: React.ReactNode;
  name: string; description: string;
  connStatus: ConnStatus; saved: boolean;
  lastSynced?: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const s = cardDisplayStatus(saved, connStatus);

  return (
    <div
      onClick={onClick}
      className="cursor-pointer flex flex-col rounded-xl overflow-hidden transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: hovered
          ? `0 8px 28px rgba(0,0,0,0.55), 0 0 0 1px ${accentColor}50`
          : "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: "3px", background: accentColor, flexShrink: 0 }} />

      {/* Card body */}
      <div className="flex flex-col flex-1 p-5">
        {/* Icon row + status badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
            style={{ background: `${accentColor}1a`, border: `1px solid ${accentColor}35` }}>
            {icon}
          </div>
          {/* Status badge */}
          <Badge style={{ background: s.bg, color: s.color, border: "none" }}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${connStatus === "testing" ? "animate-pulse" : ""}`}
              style={{ background: s.dot }} />
            {s.label}
          </Badge>
        </div>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{name}</h3>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{description}</p>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-[13px] font-medium flex items-center gap-1.5 transition-colors duration-150"
            style={{ color: hovered ? accentColor : "var(--text-muted)" }}>
            Configure
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
          {lastSynced && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Synced {timeSince(lastSynced)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   DrawerSection — labeled section divider
   ══════════════════════════════════════════ */
function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{label}</span>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   DrawerActions — footer action bar
   ══════════════════════════════════════════ */
function DrawerActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-4 flex items-center gap-3 flex-wrap"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", marginTop: "auto" }}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   Provider Icons
   ══════════════════════════════════════════ */
function ServiceNowIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={PROVIDER_COLORS.servicenow}>
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a7 7 0 110 14A7 7 0 0112 5zm0 2a5 5 0 100 10A5 5 0 0012 7z"/>
    </svg>
  );
}

function BmcIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={PROVIDER_COLORS.bmc_helix}>
      <path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm13 2a3 3 0 100 6 3 3 0 000-6z"/>
    </svg>
  );
}

function AtlassianIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={PROVIDER_COLORS.atlassian}>
      <path d="M8.493 12.19C8.2 11.85 7.74 11.87 7.5 12.24L2.1 21.03c-.25.41 0 .97.49.97h7.03c.27 0 .52-.15.65-.39 1.52-2.79 1.07-6.57-1.78-9.41zm3.47-9.56a14.12 14.12 0 000 19.37c.13.13.31.22.5.22h7.03c.49 0 .74-.57.49-.97L12 2.64c-.22-.38-.83-.38-1.04 0l-.04.07z"/>
    </svg>
  );
}

function CustomIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={PROVIDER_COLORS.custom} strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

/* ══════════════════════════════════════════
   ServiceNow Integration
   ══════════════════════════════════════════ */
function ServiceNowIntegration({ saved, onSaved }: { saved: CmdbIntegration | undefined; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(saved?.instance ?? "");
  const [username, setUsername] = useState(saved?.username ?? "");
  const [password, setPassword] = useState(saved?.password ?? "");
  const [table, setTable]       = useState(saved?.table ?? "cmdb_ci_computer");
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg]       = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form fields when drawer opens
  useEffect(() => {
    if (open) {
      setInstance(saved?.instance ?? "");
      setUsername(saved?.username ?? "");
      setPassword(saved?.password ?? "");
      setTable(saved?.table ?? "cmdb_ci_computer");
    }
  }, [open, saved]);

  const test = async () => {
    setConnStatus("testing"); setConnMsg("");
    const r = await testCmdbConnection("servicenow", { instance, username, password, table });
    setConnStatus(r.status); setConnMsg(r.message);
  };
  const save = async () => {
    setSaving(true);
    try { await saveCmdbIntegration("servicenow", { type: "servicenow", instance, username, password, table }); onSaved(); }
    finally { setSaving(false); }
  };
  const imp = async () => {
    setImportStatus("importing"); setImportMsg("");
    const r = await importCmdbData("servicenow", "servicenow");
    if (r.error) { setImportStatus("error"); setImportMsg(r.error); }
    else { setImportStatus("done"); setImportMsg(r.message ?? "Import complete"); onSaved(); }
  };

  return (
    <>
      <MarketplaceCard
        accentColor={PROVIDER_COLORS.servicenow}
        icon={<ServiceNowIcon />}
        name="ServiceNow CMDB"
        description="Pull configuration items from ServiceNow CMDB tables for automated vulnerability scanning."
        connStatus={connStatus}
        saved={!!saved}
        lastSynced={saved?.last_synced}
        onClick={() => setOpen(true)}
      />
      <Drawer open={open} onClose={() => setOpen(false)}
        title="ServiceNow CMDB" subtitle="Pull CI data from ServiceNow tables"
        icon={<ServiceNowIcon size={18} />} accentColor={PROVIDER_COLORS.servicenow}>

        <DrawerSection label="Connection">
          <FieldRow label="Instance" value={instance} onChange={setInstance}
            placeholder="my-org  →  my-org.service-now.com"
            hint="Enter only the subdomain, not the full URL" />
          <FieldRow label="Username" value={username} onChange={setUsername} placeholder="admin" />
          <FieldRow label="Password" value={password} onChange={setPassword} type="password" />
        </DrawerSection>

        <DrawerSection label="Configuration">
          <FieldRow label="CI Table" value={table} onChange={setTable} type="select"
            options={[
              { value: "cmdb_ci_computer",    label: "Computer  (cmdb_ci_computer)" },
              { value: "cmdb_ci_server",      label: "Server  (cmdb_ci_server)" },
              { value: "cmdb_ci_appl",        label: "Application  (cmdb_ci_appl)" },
              { value: "cmdb_ci_vm_instance", label: "VM Instance  (cmdb_ci_vm_instance)" },
              { value: "alm_hardware",        label: "Hardware Asset  (alm_hardware)" },
            ]}
          />
        </DrawerSection>

        {connStatus !== "idle" && <StatusPill status={connStatus} message={connMsg} />}
        <ImportPill status={importStatus} message={importMsg} />
        {saved?.last_synced && (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Last synced: {timeSince(saved.last_synced)}</p>
        )}

        <DrawerActions>
          <ActionBtn variant="secondary" onClick={test} disabled={connStatus === "testing"}>
            {connStatus === "testing" ? "Testing…" : "Test Connection"}
          </ActionBtn>
          <ActionBtn variant="secondary" onClick={imp} disabled={importStatus === "importing"}>
            {importStatus === "importing" ? "Importing…" : "Import Now"}
          </ActionBtn>
          <ActionBtn variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Config"}
          </ActionBtn>
        </DrawerActions>
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════
   BMC Helix Integration
   ══════════════════════════════════════════ */
function BmcHelixIntegration({ saved, onSaved }: { saved: CmdbIntegration | undefined; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [server,   setServer]   = useState(saved?.server   ?? "");
  const [username, setUsername] = useState(saved?.username ?? "");
  const [password, setPassword] = useState(saved?.password ?? "");
  const [tenant,   setTenant]   = useState(saved?.tenant   ?? "");
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg]       = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setServer(saved?.server ?? ""); setUsername(saved?.username ?? "");
      setPassword(saved?.password ?? ""); setTenant(saved?.tenant ?? "");
    }
  }, [open, saved]);

  const test = async () => {
    setConnStatus("testing"); setConnMsg("");
    const r = await testCmdbConnection("bmc_helix", { server, username, password, tenant });
    setConnStatus(r.status); setConnMsg(r.message);
  };
  const save = async () => {
    setSaving(true);
    try { await saveCmdbIntegration("bmc_helix", { type: "bmc_helix", server, username, password, tenant }); onSaved(); }
    finally { setSaving(false); }
  };
  const imp = async () => {
    setImportStatus("importing"); setImportMsg("");
    const r = await importCmdbData("bmc_helix", "bmc_helix");
    if (r.error) { setImportStatus("error"); setImportMsg(r.error); }
    else { setImportStatus("done"); setImportMsg(r.message ?? "Import complete"); onSaved(); }
  };

  return (
    <>
      <MarketplaceCard
        accentColor={PROVIDER_COLORS.bmc_helix}
        icon={<BmcIcon />}
        name="BMC Helix CMDB"
        description="Connect to BMC Helix ITSM to import asset data via REST API for vulnerability correlation."
        connStatus={connStatus}
        saved={!!saved}
        lastSynced={saved?.last_synced}
        onClick={() => setOpen(true)}
      />
      <Drawer open={open} onClose={() => setOpen(false)}
        title="BMC Helix CMDB" subtitle="Import assets from BMC Helix ITSM"
        icon={<BmcIcon size={18} />} accentColor={PROVIDER_COLORS.bmc_helix}>

        <DrawerSection label="Connection">
          <FieldRow label="Server URL" value={server} onChange={setServer} placeholder="https://helix.yourcompany.com" />
          <FieldRow label="Username" value={username} onChange={setUsername} />
          <FieldRow label="Password" value={password} onChange={setPassword} type="password" />
        </DrawerSection>

        <DrawerSection label="Configuration">
          <FieldRow label="Tenant ID" value={tenant} onChange={setTenant}
            placeholder="Optional — leave blank if not multi-tenant" />
        </DrawerSection>

        {connStatus !== "idle" && <StatusPill status={connStatus} message={connMsg} />}
        <ImportPill status={importStatus} message={importMsg} />
        {saved?.last_synced && (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Last synced: {timeSince(saved.last_synced)}</p>
        )}

        <DrawerActions>
          <ActionBtn variant="secondary" onClick={test} disabled={connStatus === "testing"}>
            {connStatus === "testing" ? "Testing…" : "Test Connection"}
          </ActionBtn>
          <ActionBtn variant="secondary" onClick={imp} disabled={importStatus === "importing"}>
            {importStatus === "importing" ? "Importing…" : "Import Now"}
          </ActionBtn>
          <ActionBtn variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Config"}
          </ActionBtn>
        </DrawerActions>
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════
   Atlassian Integration
   ══════════════════════════════════════════ */
function AtlassianIntegration({ saved, onSaved }: { saved: CmdbIntegration | undefined; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [email,       setEmail]       = useState(saved?.email        ?? "");
  const [apiToken,    setApiToken]    = useState(saved?.api_token    ?? "");
  const [workspaceId, setWorkspaceId] = useState(saved?.workspace_id ?? "");
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg]       = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(saved?.email ?? ""); setApiToken(saved?.api_token ?? "");
      setWorkspaceId(saved?.workspace_id ?? "");
    }
  }, [open, saved]);

  const test = async () => {
    setConnStatus("testing"); setConnMsg("");
    const r = await testCmdbConnection("atlassian", { email, api_token: apiToken, workspace_id: workspaceId });
    setConnStatus(r.status); setConnMsg(r.message);
  };
  const save = async () => {
    setSaving(true);
    try { await saveCmdbIntegration("atlassian", { type: "atlassian", email, api_token: apiToken, workspace_id: workspaceId }); onSaved(); }
    finally { setSaving(false); }
  };
  const imp = async () => {
    setImportStatus("importing"); setImportMsg("");
    const r = await importCmdbData("atlassian", "atlassian");
    if (r.error) { setImportStatus("error"); setImportMsg(r.error); }
    else { setImportStatus("done"); setImportMsg(r.message ?? "Import complete"); onSaved(); }
  };

  return (
    <>
      <MarketplaceCard
        accentColor={PROVIDER_COLORS.atlassian}
        icon={<AtlassianIcon />}
        name="Atlassian Assets"
        description="Import IT assets from Atlassian JSM Assets (formerly Insight) using the REST API."
        connStatus={connStatus}
        saved={!!saved}
        lastSynced={saved?.last_synced}
        onClick={() => setOpen(true)}
      />
      <Drawer open={open} onClose={() => setOpen(false)}
        title="Atlassian Assets" subtitle="Import from Atlassian JSM Assets / Insight"
        icon={<AtlassianIcon size={18} />} accentColor={PROVIDER_COLORS.atlassian}>

        <DrawerSection label="Authentication">
          <FieldRow label="Email / Username" value={email} onChange={setEmail} placeholder="you@company.com" />
          <FieldRow label="API Token" value={apiToken} onChange={setApiToken} type="password"
            hint="Generate at id.atlassian.com → Security → API tokens" />
        </DrawerSection>

        <DrawerSection label="Configuration">
          <FieldRow label="Workspace ID" value={workspaceId} onChange={setWorkspaceId}
            placeholder="e.g. 12a34bc5-6789-…"
            hint="Found in Atlassian Assets → Settings" />
        </DrawerSection>

        {connStatus !== "idle" && <StatusPill status={connStatus} message={connMsg} />}
        <ImportPill status={importStatus} message={importMsg} />
        {saved?.last_synced && (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Last synced: {timeSince(saved.last_synced)}</p>
        )}

        <DrawerActions>
          <ActionBtn variant="secondary" onClick={test} disabled={connStatus === "testing"}>
            {connStatus === "testing" ? "Testing…" : "Test Connection"}
          </ActionBtn>
          <ActionBtn variant="secondary" onClick={imp} disabled={importStatus === "importing"}>
            {importStatus === "importing" ? "Importing…" : "Import Now"}
          </ActionBtn>
          <ActionBtn variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Config"}
          </ActionBtn>
        </DrawerActions>
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════
   Custom Integrations
   ══════════════════════════════════════════ */
const EMPTY_CUSTOM: Omit<CustomEntry, "id"> = {
  name: "", endpoint: "", auth_type: "none",
  username: "", password: "", token: "", key_header: "X-API-Key", api_key: "",
};

function CustomIntegrations({ savedAll, onSaved }: {
  savedAll: Record<string, CmdbIntegration>; onSaved: () => void;
}) {
  const customs = Object.entries(savedAll)
    .filter(([k]) => k.startsWith("custom_"))
    .map(([k, v]) => ({ id: k, ...(v as any) } as CustomEntry));

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "form">("list");
  const [form, setForm] = useState<Omit<CustomEntry, "id">>({ ...EMPTY_CUSTOM });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg]       = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");
  // Track which custom entry is being imported
  const [importingId, setImportingId] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ ...EMPTY_CUSTOM }); setEditId(null); setView("list");
    setConnStatus("idle"); setConnMsg(""); setImportStatus("idle"); setImportMsg("");
  };

  const startEdit = (c: CustomEntry) => {
    setForm({ name: c.name, endpoint: c.endpoint, auth_type: c.auth_type,
      username: c.username, password: c.password, token: c.token,
      key_header: c.key_header, api_key: c.api_key });
    setEditId(c.id); setView("form");
  };

  const save = async () => {
    if (!form.name || !form.endpoint) return;
    setSaving(true);
    const id = editId ?? `custom_${Date.now().toString(36)}`;
    try { await saveCmdbIntegration(id, { type: "custom", ...form }); onSaved(); resetForm(); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => { await deleteCmdbIntegration(id); onSaved(); };

  const test = async () => {
    setConnStatus("testing"); setConnMsg("");
    const r = await testCmdbConnection("custom", {
      endpoint: form.endpoint, auth_type: form.auth_type,
      username: form.username, password: form.password,
      token: form.token, key_header: form.key_header, api_key: form.api_key,
    });
    setConnStatus(r.status); setConnMsg(r.message);
  };

  const imp = async (id: string) => {
    setImportingId(id); setImportStatus("importing"); setImportMsg("");
    const r = await importCmdbData(id, "custom");
    setImportingId(null);
    if (r.error) { setImportStatus("error"); setImportMsg(r.error); }
    else { setImportStatus("done"); setImportMsg(r.message ?? "Import complete"); onSaved(); }
  };

  const connected = customs.filter(c => c.endpoint).length;

  return (
    <>
      <MarketplaceCard
        accentColor={PROVIDER_COLORS.custom}
        icon={<CustomIcon />}
        name="Custom REST API"
        description={`Connect any REST API-based CMDB or asset management system. ${customs.length} integration${customs.length !== 1 ? "s" : ""} configured.`}
        connStatus="idle"
        saved={customs.length > 0}
        onClick={() => { setOpen(true); setView("list"); }}
      />
      <Drawer open={open} onClose={() => { setOpen(false); resetForm(); }}
        title="Custom Integrations" subtitle="Connect any REST API-based CMDB"
        icon={<CustomIcon size={18} />} accentColor={PROVIDER_COLORS.custom}>

        {view === "list" ? (
          <>
            {/* List view */}
            {customs.length > 0 ? (
              <DrawerSection label={`${customs.length} integration${customs.length !== 1 ? "s" : ""}`}>
                <div className="space-y-2">
                  {customs.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3.5 rounded-lg"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PROVIDER_COLORS.custom }} />
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.name}</div>
                          <div className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>{c.endpoint}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <ActionBtn variant="secondary" onClick={() => imp(c.id)} disabled={importingId === c.id}>
                          {importingId === c.id ? "…" : "Import"}
                        </ActionBtn>
                        <ActionBtn variant="secondary" onClick={() => startEdit(c)}>Edit</ActionBtn>
                        <ActionBtn variant="danger" onClick={() => del(c.id)}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </ActionBtn>
                      </div>
                    </div>
                  ))}
                  <ImportPill status={importStatus} message={importMsg} />
                </div>
              </DrawerSection>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: "var(--surface-raised)", border: "1px dashed var(--border-hover)" }}>
                  <svg className="w-6 h-6" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text-secondary)" }}>No custom integrations yet</p>
                  <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>Connect any REST API with credentials or token auth</p>
                </div>
              </div>
            )}

            <DrawerActions>
              <ActionBtn variant="primary" onClick={() => { setView("form"); setEditId(null); setForm({ ...EMPTY_CUSTOM }); }}>
                + Add Integration
              </ActionBtn>
            </DrawerActions>
          </>
        ) : (
          <>
            {/* Form view */}
            <DrawerSection label={editId ? "Edit Integration" : "New Integration"}>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="My CMDB" />
                <FieldRow label="Endpoint URL" value={form.endpoint} onChange={v => setForm(f => ({ ...f, endpoint: v }))} placeholder="https://cmdb.company.com/api" />
              </div>
              <FieldRow label="Auth Type" value={form.auth_type} onChange={v => setForm(f => ({ ...f, auth_type: v as any }))}
                type="select" options={[
                  { value: "none",    label: "None (Public)" },
                  { value: "basic",   label: "Basic Auth" },
                  { value: "bearer",  label: "Bearer Token" },
                  { value: "api_key", label: "API Key Header" },
                ]} />
              {form.auth_type === "basic" && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Username" value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} />
                  <FieldRow label="Password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} type="password" />
                </div>
              )}
              {form.auth_type === "bearer" && (
                <FieldRow label="Bearer Token" value={form.token} onChange={v => setForm(f => ({ ...f, token: v }))} type="password" />
              )}
              {form.auth_type === "api_key" && (
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Header Name" value={form.key_header} onChange={v => setForm(f => ({ ...f, key_header: v }))} placeholder="X-API-Key" />
                  <FieldRow label="API Key" value={form.api_key} onChange={v => setForm(f => ({ ...f, api_key: v }))} type="password" />
                </div>
              )}
            </DrawerSection>

            {connStatus !== "idle" && <StatusPill status={connStatus} message={connMsg} />}

            <DrawerActions>
              <ActionBtn variant="secondary" onClick={test} disabled={!form.endpoint || connStatus === "testing"}>
                {connStatus === "testing" ? "Testing…" : "Test"}
              </ActionBtn>
              <ActionBtn variant="primary" onClick={save} disabled={saving || !form.name || !form.endpoint}>
                {saving ? "Saving…" : editId ? "Update" : "Add"}
              </ActionBtn>
              <ActionBtn variant="secondary" onClick={resetForm}>Back</ActionBtn>
            </DrawerActions>
          </>
        )}
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════
   Settings Page
   ══════════════════════════════════════════ */
export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Record<string, CmdbIntegration>>({});
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await getCmdbIntegrations();
      setIntegrations(data);
    } catch (e: any) {
      setFetchErr(e.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const configuredCount = Object.keys(integrations).length;

  return (
    <div className="space-y-8 w-full">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}>
            Integrations
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Connect CMDB sources to auto-import asset data for vulnerability scanning.
          </p>
        </div>
        {configuredCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium flex-shrink-0"
            style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--accent)" }} />
            {configuredCount} configured
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-lg"
        style={{ background: "rgba(74,158,255,0.06)", border: "1px solid rgba(74,158,255,0.18)" }}>
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="var(--info)" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--info)" }}>
          Click any card to configure credentials. Use <strong>Import Now</strong> to pull live CI data into your organization CMDB config — used automatically when generating vulnerability reports from the <strong>Intel</strong> dashboard.
        </p>
      </div>

      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
          CMDB Integrations
        </h2>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      ) : fetchErr ? (
        <div className="px-5 py-4 rounded-lg text-[14px]"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "var(--danger)" }}>
          {fetchErr}
        </div>
      ) : (
        /* ── Marketplace Grid ── */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ServiceNowIntegration  saved={integrations["servicenow"]}  onSaved={reload} />
          <BmcHelixIntegration    saved={integrations["bmc_helix"]}   onSaved={reload} />
          <AtlassianIntegration   saved={integrations["atlassian"]}   onSaved={reload} />
          <CustomIntegrations     savedAll={integrations}              onSaved={reload} />
        </div>
      )}
    </div>
  );
}
