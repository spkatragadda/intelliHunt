import { ReactNode } from "react";

export default function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number | ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-sm text-slate-400">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {subtitle && <div className="mt-2 text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}
