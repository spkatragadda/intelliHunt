import type { Metadata } from "next";
import "./globals.css";                 // keep this
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: { default: "IntelliHunt", template: "%s | IntelliHunt" },
  description: "NVD-driven threat intelligence viewer",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">   {/* force dark */}
      <body>
        <Sidebar />
        <Header />
        <main className="mx-auto max-w-6xl md:ml-64 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
