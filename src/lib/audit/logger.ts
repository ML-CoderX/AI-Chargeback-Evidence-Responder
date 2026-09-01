// ============================================================
// Audit Logger — Immutable audit trail writer
// ============================================================
// HARD BOUNDARY: This module ONLY appends to the audit_log.
// There are NO update or delete operations. Every mutation
// in the system must be logged through this module.
// ============================================================

import { AuditAction } from '@/types';

// Audit entries are written via the database module.
// This file provides helper functions for constructing entries.

export interface AuditEntry {
  dispute_id: string | null;
  action: AuditAction;
  actor: string;
  details: Record<string, unknown>;
  evidence_snapshot?: Record<string, unknown> | null;
}

/**
 * Format an audit entry for insertion.
 * Timestamps are always server-generated — never client-supplied.
 */
export function formatAuditEntry(entry: AuditEntry): {
  dispute_id: string | null;
  action: AuditAction;
  actor: string;
  details: string;
  evidence_snapshot: string | null;
  timestamp: number;
} {
  return {
    dispute_id: entry.dispute_id,
    action: entry.action,
    actor: entry.actor,
    details: JSON.stringify(entry.details),
    evidence_snapshot: entry.evidence_snapshot
      ? JSON.stringify(entry.evidence_snapshot)
      : null,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
