"use client";

import { useState } from "react";
import Button from "@/components/Button";
import { GenerateReportPayload, runReport } from "@/lib/api";

type KV = { vendor: string; product: string }; // for OS rows (single product)
type AppVendorProducts = { vendor: string; products: string[] }; // for Applications rows (multi products)
type Source = { name: string; fields: string[]; description: string };

function RowKV({
  value,
  onChange,
  onRemove,
  labels,
}: {
  value: KV;
  onChange: (next: KV) => void;
  onRemove: () => void;
  labels: { vendor: string; product: string };
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value.vendor}
        onChange={(e) => onChange({ ...value, vendor: e.target.value })}
        placeholder={labels.vendor}
        className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
      />
      <input
        value={value.product}
        onChange={(e) => onChange({ ...value, product: e.target.value })}
        placeholder={labels.product}
        className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
      />
      <Button className="bg-slate-700 hover:bg-slate-600" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

function RowApp({
  value,
  onChange,
  onRemove,
}: {
  value: AppVendorProducts;
  onChange: (next: AppVendorProducts) => void;
  onRemove: () => void;
}) {
  const [productsText, setProductsText] = useState(value.products.join(", "));
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value.vendor}
          onChange={(e) => onChange({ ...value, vendor: e.target.value })}
          placeholder="Vendor (e.g., Microsoft)"
          className="w-full sm:w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
        <input
          value={productsText}
          onChange={(e) => {
            const txt = e.target.value;
            setProductsText(txt);
            const parts = txt
              .split(/[,\n]/g)
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...value, products: parts });
          }}
          placeholder="Products (comma-separated, e.g., SharePoint, Office, PowerPoint)"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
        <Button className="bg-slate-700 hover:bg-slate-600" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {value.products.length > 0 && (
        <div className="text-xs text-slate-400">
          {value.products.length} product{value.products.length === 1 ? "" : "s"}:{" "}
          <span className="text-slate-300">{value.products.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function RowSource({
  value,
  onChange,
  onRemove,
}: {
  value: Source;
  onChange: (next: Source) => void;
  onRemove: () => void;
}) {
  const [fieldsText, setFieldsText] = useState(value.fields.join(", "));
  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Source type name (e.g., SIEM, EDR, WAF)"
          className="w-full sm:w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
        <input
          value={fieldsText}
          onChange={(e) => {
            const txt = e.target.value;
            setFieldsText(txt);
            const parts = txt
              .split(/[,\n]/g)
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...value, fields: parts });
          }}
          placeholder="Fields (comma-separated)"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
        <Button className="bg-slate-700 hover:bg-slate-600" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <textarea
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        placeholder="Description"
        className="w-full min-h-[72px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
      />
    </div>
  );
}

export default function Generate() {
  // OS stays as single product per row (vendor + product)
  const [os, setOs] = useState<KV[]>([{ vendor: "", product: "" }]);

  // Applications now accept multiple products per vendor
  const [apps, setApps] = useState<AppVendorProducts[]>([
    { vendor: "", products: [] },
  ]);

  const [sources, setSources] = useState<Source[]>([
    { name: "", fields: [], description: "" },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [payloadPreview, setPayloadPreview] = useState<string | null>(null);

  function addOs() {
    setOs((arr) => [...arr, { vendor: "", product: "" }]);
  }
  function addApp() {
    setApps((arr) => [...arr, { vendor: "", products: [] }]);
  }
  function addSource() {
    setSources((arr) => [...arr, { name: "", fields: [], description: "" }]);
  }

  async function submit() {
    setSubmitting(true);
    setServerMsg(null);
    try {
      // Clean empty rows
      const osClean = os.filter((r) => r.vendor || r.product);
      const appsClean = apps
        .filter((r) => r.vendor || (r.products && r.products.length))
        .map((r) => ({
          vendor: r.vendor,
          products: r.products.filter(Boolean),
        }));
      const sourcesClean = sources.filter(
        (s) => s.name || s.fields.length || s.description
      );

      const payload: GenerateReportPayload = {
        os: osClean,
        applications: appsClean,
        sources: sourcesClean.map((s) => ({
          name: s.name,
          fields: s.fields,
          description: s.description,
        })),
      };

      setPayloadPreview(JSON.stringify(payload, null, 2));

      const res = await runReport(payload);
      setServerMsg(res.message || "Submitted.");
    } catch (e: any) {
      setServerMsg(e?.message ?? "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Generate Report</h1>
        <div className="text-sm text-slate-400">Customize inputs and start a run</div>
      </div>

      {/* OS Section */}
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-100">Operating Systems</h2>
          <Button onClick={addOs}>+ Add OS</Button>
        </div>
        <p className="text-sm text-slate-300">
          Add each OS your environment runs (vendor and product).
        </p>
        <div className="space-y-3">
          {os.map((row, idx) => (
            <RowKV
              key={`os-${idx}`}
              value={row}
              onChange={(next) =>
                setOs((arr) => arr.map((r, i) => (i === idx ? next : r)))
              }
              onRemove={() => setOs((arr) => arr.filter((_, i) => i !== idx))}
              labels={{
                vendor: "Vendor (e.g., Microsoft)",
                product: "Product (e.g., Windows 11)",
              }}
            />
          ))}
        </div>
      </section>

      {/* Applications Section (multi-products per vendor) */}
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-100">Applications</h2>
          <Button onClick={addApp}>+ Add Application Vendor</Button>
        </div>
        <p className="text-sm text-slate-300">
          Enter the vendor and a comma-separated list of products under that vendor.
        </p>
        <div className="space-y-3">
          {apps.map((row, idx) => (
            <RowApp
              key={`app-${idx}`}
              value={row}
              onChange={(next) =>
                setApps((arr) => arr.map((r, i) => (i === idx ? next : r)))
              }
              onRemove={() => setApps((arr) => arr.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      </section>

      {/* Source Types Section */}
      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-100">Source Types</h2>
          <Button onClick={addSource}>+ Add Source Type</Button>
        </div>
        <p className="text-sm text-slate-300">
          Define any telemetry sources (e.g., SIEM, EDR). Each source has a name, fields, and description.
        </p>
        <div className="space-y-3">
          {sources.map((row, idx) => (
            <RowSource
              key={`src-${idx}`}
              value={row}
              onChange={(next) =>
                setSources((arr) => arr.map((r, i) => (i === idx ? next : r)))
              }
              onRemove={() => setSources((arr) => arr.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          className={submitting ? "opacity-70 cursor-not-allowed" : ""}
        >
          {submitting ? "Submitting…" : "Run Report"}
        </Button>
        {serverMsg && <span className="text-sm text-slate-300">{serverMsg}</span>}
      </div>

      {/* Debug / Payload Preview */}
      {payloadPreview && (
        <details className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <summary className="cursor-pointer text-slate-200">
            Payload Preview
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-300">
            {payloadPreview}
          </pre>
        </details>
      )}
    </div>
  );
}