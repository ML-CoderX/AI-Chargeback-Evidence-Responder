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
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
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
        setMetrics(data.metrics);
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

  return (
    <div style={{ padding: "var(--sp-8)", maxWidth: 720 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", marginBottom: "var(--sp-2)" }}>
        Evaluation metrics
      </h1>
      <p style={{ color: "var(--ink-secondary)", fontSize: "0.85rem", marginBottom: "var(--sp-6)" }}>
        Holdout set only (20 disputes, never used during weight tuning). Classification threshold: 0.5.
      </p>

      {loading && <p style={{ color: "var(--ink-muted)" }}>Computing…</p>}
      {error && <p style={{ color: "var(--signal-weak)" }}>{error}</p>}

      {metrics && (
        <>
          {/* Classification metrics table */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Classification performance
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--sp-8)", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr style={trStyle}><td style={tdStyle}>Precision</td><td style={tdStyle}>{(metrics.precision * 100).toFixed(1)}%</td></tr>
              <tr style={trStyle}><td style={tdStyle}>Recall</td><td style={tdStyle}>{(metrics.recall * 100).toFixed(1)}%</td></tr>
              <tr style={trStyle}><td style={tdStyle}>F1 score</td><td style={{...tdStyle, fontWeight: 600}}>{(metrics.f1 * 100).toFixed(1)}%</td></tr>
              <tr style={trStyle}><td style={tdStyle}>Threshold</td><td style={tdStyle}>{metrics.threshold}</td></tr>
            </tbody>
          </table>

          {/* Confusion matrix */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Confusion matrix
          </h2>
          <table style={{ borderCollapse: "collapse", marginBottom: "var(--sp-8)", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={thStyle}></th>
                <th style={thStyle}>Predicted win</th>
                <th style={thStyle}>Predicted loss</th>
              </tr>
            </thead>
            <tbody>
              <tr style={trStyle}>
                <td style={{...tdStyle, fontWeight: 600}}>Actually won</td>
                <td style={{...tdStyle, color: "var(--signal-strong)", fontWeight: 600}}>{metrics.truePositives} (TP)</td>
                <td style={{...tdStyle, color: "var(--signal-weak)"}}>{metrics.falseNegatives} (FN)</td>
              </tr>
              <tr style={trStyle}>
                <td style={{...tdStyle, fontWeight: 600}}>Actually lost</td>
                <td style={{...tdStyle, color: "var(--signal-weak)"}}>{metrics.falsePositives} (FP)</td>
                <td style={{...tdStyle, color: "var(--signal-strong)", fontWeight: 600}}>{metrics.trueNegatives} (TN)</td>
              </tr>
            </tbody>
          </table>

          {/* Cost analysis */}
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", marginBottom: "var(--sp-3)" }}>
            Cost analysis
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
                <td style={tdStyle}>{metrics.falsePositives}</td>
                <td style={tdStyle}>₹{metrics.fpCostPer} (analyst time)</td>
                <td style={tdStyle}>₹{metrics.totalFpCost.toLocaleString("en-IN")}</td>
              </tr>
              <tr style={trStyle}>
                <td style={tdStyle}>False negative (predicted loss, won)</td>
                <td style={tdStyle}>{metrics.falseNegatives}</td>
                <td style={tdStyle}>₹{metrics.fnCostPer.toLocaleString("en-IN")} (avg dispute)</td>
                <td style={tdStyle}>₹{metrics.totalFnCost.toLocaleString("en-IN")}</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--ink)" }}>
                <td style={{...tdStyle, fontWeight: 600}} colSpan={3}>Total estimated cost</td>
                <td style={{...tdStyle, fontWeight: 600, fontSize: "1rem"}}>₹{metrics.totalCost.toLocaleString("en-IN")}</td>
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

      {!metrics && !loading && !error && (
        <div style={{ textAlign: "center", padding: "var(--sp-8)" }}>
          <p style={{ color: "var(--ink-muted)", marginBottom: "var(--sp-4)" }}>
            Score all disputes first, then return here to see evaluation metrics.
          </p>
          <button className="btn" onClick={fetchMetrics}>
            Compute metrics
          </button>
        </div>
      )}
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
