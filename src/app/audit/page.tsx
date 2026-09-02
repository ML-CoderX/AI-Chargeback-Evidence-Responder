"use client";

import { useEffect, useState, useCallback } from "react";

interface AuditEntry {
  id: number;
  dispute_id: string | null;
  action: string;
  actor: string;
  payload_json: string;
  timestamp: number;
}

function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("action", filter);
    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  return (
    <div style={{ padding: "var(--sp-8)", maxWidth: 720 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", marginBottom: "var(--sp-2)" }}>
        Audit trail
      </h1>
      <p style={{ color: "var(--ink-secondary)", fontSize: "0.85rem", marginBottom: "var(--sp-6)" }}>
        Immutable log · {entries.length} entries
      </p>

      <select
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{
          padding: "var(--sp-1) var(--sp-2)",
          fontSize: "0.75rem",
          border: "1px solid var(--surface-border)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-raised)",
          color: "var(--ink-secondary)",
          cursor: "pointer",
          marginBottom: "var(--sp-6)",
        }}
        aria-label="Filter by action"
      >
        <option value="">All actions</option>
        <option value="dispute_created">dispute created</option>
        <option value="evidence_retrieved">evidence retrieved</option>
        <option value="score_computed">score computed</option>
        <option value="draft_generated">draft generated</option>
        <option value="marked_reviewed">marked reviewed</option>
        <option value="evaluation_run">evaluation run</option>
      </select>

      {loading ? (
        <p style={{ color: "var(--ink-muted)" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>No audit entries found.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: "var(--sp-6)" }}>
          {/* Timeline line */}
          <div style={{
            position: "absolute", left: 7, top: 4, bottom: 4,
            width: 1, background: "var(--surface-border)",
          }} />

          {entries.map((e) => {
            const isExpanded = expanded === e.id;
            let payload: Record<string, unknown> = {};
            try { payload = JSON.parse(e.payload_json); } catch { /* ignore */ }

            return (
              <div key={e.id} style={{ position: "relative", marginBottom: "var(--sp-4)" }}>
                {/* Dot */}
                <div style={{
                  position: "absolute", left: -21, top: 6,
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--surface-border)",
                  border: "2px solid var(--surface-base)",
                }} />

                <button
                  onClick={() => setExpanded(isExpanded ? null : e.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                    padding: "var(--sp-2) 0",
                  }}
                >
                  <div style={{ fontSize: "0.65rem", color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                    {fmtDateTime(e.timestamp)}
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    {e.action.replace(/_/g, " ")}
                    {e.dispute_id && (
                      <span style={{ color: "var(--ink-muted)", fontSize: "0.7rem", marginLeft: "var(--sp-2)" }}>
                        {e.dispute_id}
                      </span>
                    )}
                    <span style={{ color: "var(--ink-faint)", fontSize: "0.65rem", marginLeft: "var(--sp-2)" }}>
                      by {e.actor}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <pre style={{
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-mono)",
                    background: "var(--surface-inset)",
                    padding: "var(--sp-3)",
                    borderRadius: "var(--radius-md)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    color: "var(--ink-secondary)",
                    border: "1px solid var(--surface-border-subtle)",
                    marginTop: "var(--sp-1)",
                  }}>
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
