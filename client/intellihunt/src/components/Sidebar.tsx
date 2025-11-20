"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/report", label: "Report" },
  { href: "/vulnerabilities", label: "Vulnerabilities" },
  { href: "/generate", label: "Generate Report" },
  { href: "/repo-scanner", label: "Repo Scanner" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside
      className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r
                 border-slate-800 bg-slate-900 md:flex"
    >
      <div className="mb-6 px-4 pt-4 text-xl font-semibold text-slate-100">IntelliHunt</div>
      <nav className="space-y-1 px-4">
        {nav.map((i) => {
          const active = path === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`block rounded-lg px-3 py-2 text-sm transition
                ${active
                  ? "bg-slate-700 text-white"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 pb-4 text-[11px] text-slate-400">NVD-powered</div>
    </aside>
  );
}
