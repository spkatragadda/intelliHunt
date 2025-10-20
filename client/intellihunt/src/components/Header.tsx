"use client";

import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:ml-64">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/favicon.ico" alt="IntelliHunt Logo" width={28} height={28} priority />
          <span className="text-lg font-semibold text-slate-100">IntelliHunt</span>
        </Link>
        <div aria-hidden className="text-sm text-slate-400" />
      </div>
    </header>
  );
}
