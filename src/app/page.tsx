"use client";

import { useEffect, useState, useCallback } from "react";

/* ── Types ── */
interface DisputeRow {
  id: string;
  order_id: string;
  reason_code: string;
  filed_at: number;
  amount: number;
  status: string;
  actual_outcome: string | null;
  is_holdout: number;
  win_probability: number | null;
  completeness_score: number | null;
  missing_categories: string | null;
}

interface DisputeDetail {
  dispute: Record<string, unknown>;
  evidence: {
    authentication: Record<string, unknown> | null;
    fulfillment: Record<string, unknown> | null;
    behavioral: Record<string, unknown> | null;
    communication: Record<string, unknown> | null;
  };
  scores: Array<Record<string, unknown>>;
  auditLog: Array<Record<string, unknown>>;
}

interface DraftData {
  disputeId: string;
  reasonCode: string;
  sections: Array<{
    title: string;
    status: "present" | "missing";
    content: string;
    missingReason?: string;
  }>;
  markdownText: string;
}

/* ── Helpers ── */
function fmtCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function pct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}

/* ────────────────────────────────────────────
   MAIN PAGE: Case list + Case detail
   ──────────────────────────────────────────── */
export default function CasesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DisputeDetail | null>(null);
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoringAll, setScoringAll] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [tab, setTab] = useState<"evidence" | "draft" | "audit">("evidence");
  const [sortBy, setSortBy] = useState("filed_at");
  const [filterReason, setFilterReason] = useState("");

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("sort", sortBy);
    if (filterReason) params.set("reason_code", filterReason);
    const res = await fetch(`/api/disputes?${params}`);
    if (res.ok) {
      const json = await res.json();
      setDisputes(json.data);
    }
    setLoading(false);
  }, [sortBy, filterReason]);

  const fetchDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/disputes/${id}`);
    if (res.ok) setDetail(await res.json());
  }, []);

  const fetchDraft = useCallback(async (id: string) => {
    const res = await fetch(`/api/disputes/${id}/draft`);
    if (res.ok) setDraft(await res.json());
  }, []);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  useEffect(() => {
    if (selected) {
      fetchDetail(selected);
      setDraft(null);
      setTab("evidence");
    }
  }, [selected, fetchDetail]);

  const handleSeed = async () => {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    await fetchDisputes();
    setSelected(null);
    setDetail(null);
    setSeeding(false);
  };

  const handleScore = async (id: string) => {
    setScoring(true);
    await fetch(`/api/disputes/${id}/score`, { method: "POST" });
    await fetchDetail(id);
    await fetchDisputes();
    setScoring(false);
  };

  const handleScoreAll = async () => {
    setScoringAll(true);
    await fetch("/api/score-all", { method: "POST" });
    await fetchDisputes();
    if (selected) await fetchDetail(selected);
    setScoringAll(false);
  };

  const handleMarkReviewed = async (id: string) => {
    await fetch(`/api/disputes/${id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_reviewed" }),
    });
    await fetchDetail(id);
    await fetchDisputes();
  };

  const isEmpty = disputes.length === 0 && !loading;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* ── LEFT RAIL: Case List ── */}
      <section
        style={{
          width: 380,
          minWidth: 380,
          borderRight: "1px solid var(--surface-border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-raised)",
          overflow: "hidden",
        }}
      >
        {/* Controls */}
        <div style={{ padding: "var(--sp-4)", borderBottom: "1px solid var(--surface-border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>
              Cases <span style={{ fontWeight: 400, color: "var(--ink-muted)", fontSize: "0.85rem" }}>({disputes.length})</span>
            </h2>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button className="btn" onClick={handleSeed} disabled={seeding} style={{ fontSize: "0.7rem" }}>
                {seeding ? "Seeding…" : "Seed data"}
              </button>
              <button className="btn" onClick={handleScoreAll} disabled={scoringAll} style={{ fontSize: "0.7rem" }}>
                {scoringAll ? "Scoring…" : "Score all"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={selectStyle}
              aria-label="Sort by"
            >
              <option value="filed_at">Date filed</option>
              <option value="win_probability">Win probability</option>
              <option value="completeness_score">Completeness</option>
              <option value="amount">Amount</option>
            </select>
            <select
              value={filterReason}
              onChange={e => setFilterReason(e.target.value)}
              style={selectStyle}
              aria-label="Filter reason"
            >
              <option value="">All reasons</option>
              <option value="fraudulent_transaction">Fraudulent</option>
              <option value="product_not_received">Not received</option>
              <option value="product_not_as_described">Not as described</option>
              <option value="duplicate_charge">Duplicate</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isEmpty ? (
            <div style={{ padding: "var(--sp-8)", textAlign: "center", color: "var(--ink-muted)" }}>
              <p style={{ marginBottom: "var(--sp-4)" }}>No disputes. Seed the database to begin.</p>
              <button className="btn" onClick={handleSeed}>{seeding ? "Seeding…" : "Seed 80 disputes"}</button>
            </div>
          ) : (
            disputes.map(d => (
              <CaseRow
                key={d.id}
                dispute={d}
                isSelected={selected === d.id}
                onSelect={() => setSelected(d.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* ── RIGHT PANEL: Case Detail ── */}
      <section style={{ flex: 1, overflow: "auto", padding: "var(--sp-6) var(--sp-8)" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--ink-muted)" }}>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>Select a case to review</p>
          </div>
        ) : !detail ? (
          <p style={{ color: "var(--ink-muted)" }}>Loading…</p>
        ) : (
          <div className="panel-enter" key={selected}>
            <DetailPanel
              detail={detail}
              draft={draft}
              tab={tab}
              setTab={setTab}
              scoring={scoring}
              onScore={() => handleScore(selected)}
              onFetchDraft={() => fetchDraft(selected)}
              onMarkReviewed={() => handleMarkReviewed(selected)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Styles ── */
const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: "var(--sp-1) var(--sp-2)",
  fontSize: "0.75rem",
  border: "1px solid var(--surface-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  color: "var(--ink-secondary)",
  cursor: "pointer",
};

/* ────────────────────────────────────────────
   CASE ROW — left rail item
   ──────────────────────────────────────────── */
function CaseRow({ dispute: d, isSelected, onSelect }: {
  dispute: DisputeRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasMissing = d.missing_categories && JSON.parse(d.missing_categories).length > 0;
  const missingList: string[] = d.missing_categories ? JSON.parse(d.missing_categories) : [];
  // Extract unique category names from "category.field" format
  const missingCats = [...new Set(missingList.map(m => m.split(".")[0]))];

  return (
    <button
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "var(--sp-3) var(--sp-4)",
        borderBottom: "1px solid var(--surface-border-subtle)",
        background: isSelected ? "var(--surface-inset)" : "transparent",
        cursor: "pointer",
        border: "none",
        borderLeft: isSelected ? "3px solid var(--ink)" : "3px solid transparent",
        fontFamily: "var(--font-sans)",
        transition: "background 200ms",
      }}
    >
      {/* Row 1: ID + amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--sp-1)" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: "0.85rem", fontWeight: 600 }}>
          {d.id}
        </span>
        <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{fmtCurrency(d.amount)}</span>
      </div>

      {/* Row 2: reason code (plain text, not pill) */}
      <div style={{ fontSize: "0.75rem", color: "var(--ink-secondary)", marginBottom: "var(--sp-1)" }}>
        {d.reason_code.replace(/_/g, " ")}
      </div>

      {/* Row 3: scores */}
      <div style={{ display: "flex", gap: "var(--sp-4)", fontSize: "0.7rem" }}>
        <span style={{ color: d.win_probability !== null && d.win_probability >= 0.5 ? "var(--signal-strong)" : d.win_probability !== null ? "var(--signal-weak)" : "var(--ink-muted)" }}>
          Win: {pct(d.win_probability)}
        </span>
        <span style={{ color: d.completeness_score !== null && d.completeness_score >= 0.8 ? "var(--signal-strong)" : d.completeness_score !== null ? "var(--ink-secondary)" : "var(--ink-muted)" }}>
          Complete: {pct(d.completeness_score)}
        </span>
      </div>

      {/* Missing categories — use rust accent on specific category labels */}
      {hasMissing && (
        <div style={{ marginTop: "var(--sp-1)", fontSize: "0.65rem" }}>
          {missingCats.map(cat => (
            <span
              key={cat}
              style={{
                color: "var(--signal-weak)",
                marginRight: "var(--sp-2)",
              }}
            >
              {cat} missing
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/* ────────────────────────────────────────────
   DETAIL PANEL — right side
   ──────────────────────────────────────────── */
function DetailPanel({
  detail, draft, tab, setTab, scoring, onScore, onFetchDraft, onMarkReviewed,
}: {
  detail: DisputeDetail;
  draft: DraftData | null;
  tab: "evidence" | "draft" | "audit";
  setTab: (t: "evidence" | "draft" | "audit") => void;
  scoring: boolean;
  onScore: () => void;
  onFetchDraft: () => void;
  onMarkReviewed: () => void;
}) {
  const d = detail.dispute;
  const latestScore = detail.scores[0];

  return (
    <article>
      {/* Header */}
      <header style={{ marginBottom: "var(--sp-6)" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", marginBottom: "var(--sp-1)" }}>
          {d.id as string}
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
          {(d.reason_code as string).replace(/_/g, " ")} · {fmtCurrency(d.amount as number)} · filed {fmtDate(d.filed_at as number)}
        </p>
        {d.is_holdout === 1 && (
          <span style={{ fontSize: "0.65rem", color: "var(--accent-blue)", background: "var(--accent-blue-bg)", padding: "1px 6px", borderRadius: "var(--radius-sm)", marginTop: "var(--sp-1)", display: "inline-block" }}>
            holdout
          </span>
        )}
      </header>

      {/* Score bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--sp-3) var(--sp-4)",
        background: "var(--surface-inset)", borderRadius: "var(--radius-md)",
        marginBottom: "var(--sp-6)",
        border: "1px solid var(--surface-border-subtle)",
      }}>
        <div style={{ display: "flex", gap: "var(--sp-8)", fontSize: "0.85rem" }}>
          <div>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem", display: "block" }}>Win probability</span>
            <span style={{
              fontWeight: 600, fontSize: "1.1rem",
              color: latestScore
                ? (latestScore.win_probability as number) >= 0.5 ? "var(--signal-strong)" : "var(--signal-weak)"
                : "var(--ink-muted)",
            }}>
              {latestScore ? pct(latestScore.win_probability as number) : "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem", display: "block" }}>Completeness</span>
            <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
              {latestScore ? pct(latestScore.completeness_score as number) : "—"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem", display: "block" }}>Status</span>
            <span style={{ fontSize: "0.85rem" }}>{d.status as string}</span>
          </div>
        </div>
        <button className="btn" onClick={onScore} disabled={scoring} style={{ fontSize: "0.75rem" }}>
          {scoring ? "Scoring…" : "Compute score"}
        </button>
      </div>

      {/* Top factors */}
      {latestScore && latestScore.win_probability !== null && (
        <div style={{ marginBottom: "var(--sp-6)" }}>
          <h3 style={{ fontSize: "0.8rem", fontFamily: "var(--font-serif)", marginBottom: "var(--sp-2)" }}>Score factors</h3>
          {(() => {
            try {
              const payload = JSON.parse(
                (detail.auditLog.find(a => a.action === "score_computed") as Record<string, unknown>)?.payload_json as string ?? "{}"
              );
              const factors: string[] = payload.top_factors ?? [];
              return factors.map((f: string, i: number) => (
                <div key={i} style={{
                  fontSize: "0.75rem", color: f.startsWith("+") ? "var(--signal-strong)" : f.startsWith("-") ? "var(--signal-weak)" : "var(--ink-secondary)",
                  padding: "var(--sp-1) 0",
                  fontFamily: "var(--font-mono)",
                }}>
                  {f}
                </div>
              ));
            } catch { return null; }
          })()}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "var(--sp-4)", borderBottom: "1px solid var(--surface-border)", marginBottom: "var(--sp-6)" }}>
        {(["evidence", "draft", "audit"] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "draft" && !draft) onFetchDraft();
            }}
            style={{
              padding: "var(--sp-2) 0",
              fontSize: "0.8rem",
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--ink)" : "var(--ink-muted)",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--ink)" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t === "evidence" ? "Evidence bundle" : t === "draft" ? "Response draft" : "Audit trail"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "evidence" && <EvidenceTab evidence={detail.evidence} />}
      {tab === "draft" && <DraftTab draft={draft} onFetchDraft={onFetchDraft} onMarkReviewed={onMarkReviewed} status={d.status as string} />}
      {tab === "audit" && <AuditTab entries={detail.auditLog} />}
    </article>
  );
}

/* ── Evidence Tab ── */
function EvidenceTab({ evidence }: { evidence: DisputeDetail["evidence"] }) {
  const categories = [
    { key: "authentication", label: "Transaction Authentication", data: evidence.authentication },
    { key: "fulfillment", label: "Fulfillment / Delivery", data: evidence.fulfillment },
    { key: "behavioral", label: "Customer Engagement", data: evidence.behavioral },
    { key: "communication", label: "Policy Disclosure", data: evidence.communication },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      {categories.map(cat => (
        <div key={cat.key}>
          <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "0.85rem", marginBottom: "var(--sp-2)" }}>
            {cat.label}
          </h3>
          {!cat.data ? (
            <div className="evidence-missing">
              No {cat.label.toLowerCase()} evidence on file
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)" }}>
              {Object.entries(cat.data).filter(([k]) => k !== "order_id" && k !== "customer_id").map(([key, val]) => (
                <EvidenceField key={key} label={key} value={val} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EvidenceField({ label, value }: { label: string; value: unknown }) {
  const isMissing = value === null || value === undefined;
  const displayVal = isMissing ? "not on file"
    : value === 1 ? "yes"
    : value === 0 ? "no"
    : String(value);

  return (
    <div style={{
      padding: "var(--sp-2) var(--sp-3)",
      borderLeft: `3px solid ${isMissing ? "var(--signal-weak)" : "var(--signal-strong)"}`,
      background: isMissing ? "var(--signal-weak-bg)" : "var(--signal-strong-bg)",
    }}>
      <div style={{ fontSize: "0.65rem", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label.replace(/_/g, " ")}
      </div>
      <div style={{
        fontSize: "0.8rem",
        fontWeight: 500,
        color: isMissing ? "var(--signal-weak)" : "var(--ink)",
      }}>
        {displayVal}
      </div>
    </div>
  );
}

/* ── Draft Tab ── */
function DraftTab({ draft, onFetchDraft, onMarkReviewed, status }: {
  draft: DraftData | null;
  onFetchDraft: () => void;
  onMarkReviewed: () => void;
  status: string;
}) {
  if (!draft) {
    return (
      <div style={{ textAlign: "center", padding: "var(--sp-8)" }}>
        <button className="btn" onClick={onFetchDraft}>Generate response draft</button>
      </div>
    );
  }

  return (
    <div>
      {draft.sections.map((s, i) => (
        <div key={i} style={{ marginBottom: "var(--sp-6)" }}>
          <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "0.85rem", marginBottom: "var(--sp-2)" }}>
            {s.title}
          </h3>
          {s.status === "missing" && s.missingReason && (
            <div className="evidence-missing" style={{ marginBottom: "var(--sp-2)", fontSize: "0.8rem" }}>
              {s.missingReason}
            </div>
          )}
          <pre style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.8rem",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            color: s.status === "missing" ? "var(--ink-muted)" : "var(--ink)",
          }}>
            {s.content}
          </pre>
        </div>
      ))}

      {/* No-auto-submit notice + Mark reviewed */}
      <div style={{
        marginTop: "var(--sp-8)",
        padding: "var(--sp-4)",
        border: "1px solid var(--surface-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-inset)",
      }}>
        <p style={{ fontSize: "0.8rem", color: "var(--ink-secondary)", marginBottom: "var(--sp-3)" }}>
          This tool does not submit to the network. Copy this draft into your dispute portal after review.
        </p>
        {status === "open" && (
          <button className="btn btn-reviewed" onClick={onMarkReviewed}>
            Mark reviewed
          </button>
        )}
        {status === "under_review" && (
          <span style={{ fontSize: "0.8rem", color: "var(--signal-strong)", fontWeight: 600 }}>
            ✓ Marked reviewed
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Audit Tab — vertical timeline ── */
function AuditTab({ entries }: { entries: Array<Record<string, unknown>> }) {
  if (entries.length === 0) {
    return <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>No audit entries for this dispute.</p>;
  }

  return (
    <div style={{ position: "relative", paddingLeft: "var(--sp-6)" }}>
      {/* Timeline line */}
      <div style={{
        position: "absolute", left: 7, top: 4, bottom: 4,
        width: 1, background: "var(--surface-border)",
      }} />

      {entries.map((e, i) => (
        <div key={i} style={{ position: "relative", marginBottom: "var(--sp-4)" }}>
          {/* Dot */}
          <div style={{
            position: "absolute", left: -21, top: 6,
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--surface-border)",
            border: "2px solid var(--surface-raised)",
          }} />
          <div style={{ fontSize: "0.65rem", color: "var(--ink-faint)", marginBottom: 2, fontFamily: "var(--font-mono)" }}>
            {fmtDateTime(e.timestamp as number)}
          </div>
          <div style={{ fontSize: "0.8rem" }}>
            {(e.action as string).replace(/_/g, " ")}
            <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem", marginLeft: "var(--sp-2)" }}>
              by {e.actor as string}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
