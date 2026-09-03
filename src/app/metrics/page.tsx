"use client";

import { useEffect, useState } from "react";

interface Metrics {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  fpCostPer: number;
  fnCostPer: number;
  totalFpCost: number;
  totalFnCost: number;
  totalCost: number;
}

interface FailureCase {
  disputeId: string;
  predicted: string;
  actual: string;
  probability: number;
  amount: number;
  reasonCode: string;
  explanation: string;
  modelVersion: string;
}

export default function MetricsPage() {
  const [baseline, setBaseline] = useState<Metrics | null>(null);
  const [trained, setTrained] = useState<Metrics | null>(null);
  const [failureCase, setFailureCase] = useState<FailureCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metrics");
      if (res.ok) {
        const data = await res.json();
        setBaseline(data.metrics?.baseline ?? null);
        setTrained(data.metrics?.trained ?? null);
        setFailureCase(data.failureCase);
      } else {
        setError("Score all disputes first (use the 'Score all' button on the Cases page).");
      }
    } catch {
      setError("Failed to fetch metrics.");
    }
    setLoading(false);
  };

  useEffect(() => { fetchMetrics(); }, []);

  const hasBothModels = baseline && trained;

  return (
    <div style={{ padding: "var(--sp-8)", maxWidth: 860 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", marginBottom: "var(--sp-2)" }}>
        Evaluation metrics
      </h1>
      <p style={{ color: "var(--ink-secondary)", fontSize: "0.85rem", marginBottom: "var(--sp-6)" }}>
        Holdout set only (20 disputes, never used during training). Classification threshold: 0.5.
      </p>

      {loading && <p style={{ color: "var(--ink-muted)" }}>Computing…</p>}
      {error && <p style={{ color: "var(--signal-weak)" }}>{error}</p>}

      {hasBothModels && (
        <>
          {/* Side-by-side classification metrics */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Classification performance — trained model vs rule-weighted baseline
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--sp-8)", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                <th style={thStyle}>Metric</th>
                <th style={{ ...thStyle, color: "var(--signal-strong)" }}>Trained model</th>
                <th style={thStyle}>Rule-weighted baseline</th>
                <th style={thStyle}>Δ</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Precision" trained={trained.precision} baseline={baseline.precision} />
              <MetricRow label="Recall" trained={trained.recall} baseline={baseline.recall} />
              <MetricRow label="F1 score" trained={trained.f1} baseline={baseline.f1} bold />
              <tr style={trStyle}>
                <td style={tdStyle}>True positives</td>
                <td style={tdStyle}>{trained.truePositives}</td>
                <td style={tdStyle}>{baseline.truePositives}</td>
                <td style={tdStyle}>{trained.truePositives - baseline.truePositives}</td>
              </tr>
              <tr style={trStyle}>
                <td style={tdStyle}>False positives</td>
                <td style={tdStyle}>{trained.falsePositives}</td>
                <td style={tdStyle}>{baseline.falsePositives}</td>
                <td style={tdStyle}>{trained.falsePositives - baseline.falsePositives}</td>
              </tr>
              <tr style={trStyle}>
                <td style={tdStyle}>False negatives</td>
                <td style={tdStyle}>{trained.falseNegatives}</td>
                <td style={tdStyle}>{baseline.falseNegatives}</td>
                <td style={tdStyle}>{trained.falseNegatives - baseline.falseNegatives}</td>
              </tr>
            </tbody>
          </table>

          {/* Side-by-side confusion matrices */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Confusion matrices
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-6)", marginBottom: "var(--sp-8)" }}>
            <ConfusionMatrix label="Trained model" m={trained} />
            <ConfusionMatrix label="Rule-weighted baseline" m={baseline} />
          </div>

          {/* Cost analysis */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Cost analysis — trained model
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--sp-8)", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                <th style={thStyle}>Error type</th>
                <th style={thStyle}>Count</th>
                <th style={thStyle}>Cost per</th>
                <th style={thStyle}>Total cost</th>
              </tr>
            </thead>
            <tbody>
              <tr style={trStyle}>
                <td style={tdStyle}>False positive (predicted win, lost)</td>
                <td style={tdStyle}>{trained.falsePositives}</td>
                <td style={tdStyle}>₹{trained.fpCostPer} (analyst time)</td>
                <td style={tdStyle}>₹{trained.totalFpCost.toLocaleString("en-IN")}</td>
              </tr>
              <tr style={trStyle}>
                <td style={tdStyle}>False negative (predicted loss, won)</td>
                <td style={tdStyle}>{trained.falseNegatives}</td>
                <td style={tdStyle}>₹{trained.fnCostPer.toLocaleString("en-IN")} (avg dispute)</td>
                <td style={tdStyle}>₹{trained.totalFnCost.toLocaleString("en-IN")}</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--ink)" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }} colSpan={3}>Total estimated cost</td>
                <td style={{ ...tdStyle, fontWeight: 600, fontSize: "1rem" }}>₹{trained.totalCost.toLocaleString("en-IN")}</td>
              </tr>
            </tbody>
          </table>

          <button className="btn" onClick={fetchMetrics} style={{ marginBottom: "var(--sp-8)" }}>
            Recompute
          </button>
        </>
      )}

      {/* Failure case explanation */}
      {failureCase && (
        <section>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Failure case analysis
          </h2>
          <div style={{
            padding: "var(--sp-4)",
            background: "var(--surface-inset)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius-md)",
          }}>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "var(--sp-2)" }}>
              {failureCase.disputeId} · {failureCase.reasonCode.replace(/_/g, " ")} · ₹{(failureCase.amount / 100).toLocaleString("en-IN")}
              <span style={{ marginLeft: "var(--sp-2)", color: "var(--accent-blue)" }}>({failureCase.modelVersion})</span>
            </div>
            <div style={{ fontSize: "0.8rem", marginBottom: "var(--sp-3)" }}>
              <span style={{ color: "var(--signal-weak)" }}>Predicted: {failureCase.predicted}</span>
              {" → "}
              <span style={{ color: "var(--signal-strong)" }}>Actual: {failureCase.actual}</span>
              {" · "}
              Win probability: {(failureCase.probability * 100).toFixed(1)}%
            </div>
            <p style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "var(--ink-secondary)" }}>
              {failureCase.explanation}
            </p>
          </div>
        </section>
      )}

      {!hasBothModels && !loading && !error && (
        <div style={{ textAlign: "center", padding: "var(--sp-8)" }}>
          <p style={{ color: "var(--ink-muted)", marginBottom: "var(--sp-4)" }}>
            Score all disputes first (both models), then return here for side-by-side evaluation.
          </p>
          <button className="btn" onClick={fetchMetrics}>
            Compute metrics
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Metric row helper ── */
function MetricRow({ label, trained, baseline, bold }: { label: string; trained: number; baseline: number; bold?: boolean }) {
  const delta = trained - baseline;
  const deltaStr = delta > 0 ? `+${(delta * 100).toFixed(1)}pp` : delta < 0 ? `${(delta * 100).toFixed(1)}pp` : "—";
  const deltaColor = delta > 0 ? "var(--signal-strong)" : delta < 0 ? "var(--signal-weak)" : "var(--ink-muted)";

  return (
    <tr style={trStyle}>
      <td style={tdStyle}>{label}</td>
      <td style={{ ...tdStyle, fontWeight: bold ? 700 : 500, color: "var(--signal-strong)" }}>{(trained * 100).toFixed(1)}%</td>
      <td style={{ ...tdStyle, fontWeight: bold ? 600 : 400 }}>{(baseline * 100).toFixed(1)}%</td>
      <td style={{ ...tdStyle, color: deltaColor, fontWeight: 500 }}>{deltaStr}</td>
    </tr>
  );
}

/* ── Confusion matrix mini-table ── */
function ConfusionMatrix({ label, m }: { label: string; m: Metrics }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "var(--sp-2)" }}>{label}</div>
      <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", width: "100%" }}>
        <thead>
          <tr>
            <th style={thStyle}></th>
            <th style={thStyle}>Pred win</th>
            <th style={thStyle}>Pred loss</th>
          </tr>
        </thead>
        <tbody>
          <tr style={trStyle}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>Won</td>
            <td style={{ ...tdStyle, color: "var(--signal-strong)", fontWeight: 600 }}>{m.truePositives}</td>
            <td style={{ ...tdStyle, color: "var(--signal-weak)" }}>{m.falseNegatives}</td>
          </tr>
          <tr style={trStyle}>
            <td style={{ ...tdStyle, fontWeight: 600 }}>Lost</td>
            <td style={{ ...tdStyle, color: "var(--signal-weak)" }}>{m.falsePositives}</td>
            <td style={{ ...tdStyle, color: "var(--signal-strong)", fontWeight: 600 }}>{m.trueNegatives}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--sp-2) var(--sp-3)",
  fontSize: "0.75rem",
  color: "var(--ink-muted)",
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "var(--sp-2) var(--sp-3)",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--surface-border-subtle)",
};
