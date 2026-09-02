import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Chargeback Evidence Responder",
  description: "Defense-only chargeback evidence tool for Razorpay AI Risk Manager",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.variable}>
        {/* HARD BOUNDARY: synthetic data notice */}
        <div className="synth-bar" role="alert">
          Synthetic data · test mode only · not connected to any payment network
        </div>
        <div style={{ display: "flex", minHeight: "calc(100vh - 25px)" }}>
          {/* Left rail: navigation */}
          <nav
            style={{
              width: 200,
              minWidth: 200,
              borderRight: "1px solid var(--surface-border)",
              padding: "var(--sp-6) var(--sp-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2)",
              background: "var(--surface-raised)",
            }}
            aria-label="Main navigation"
          >
            <header style={{ marginBottom: "var(--sp-6)", paddingBottom: "var(--sp-4)", borderBottom: "1px solid var(--surface-border-subtle)" }}>
              <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.3 }}>
                Chargeback<br/>Evidence Responder
              </h1>
            </header>
            <NavLink href="/" label="Cases" />
            <NavLink href="/metrics" label="Evaluation" />
            <NavLink href="/audit" label="Audit trail" />
            <div style={{ marginTop: "auto", fontSize: "0.65rem", color: "var(--ink-faint)", lineHeight: 1.5 }}>
              Razorpay AI Risk Manager<br/>Hackathon 2026
            </div>
          </nav>
          <main style={{ flex: 1, overflow: "auto", maxHeight: "calc(100vh - 25px)" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "var(--sp-2) var(--sp-3)",
        fontSize: "0.8rem",
        color: "var(--ink-secondary)",
        textDecoration: "none",
        borderRadius: "var(--radius-md)",
      }}
    >
      {label}
    </a>
  );
}
