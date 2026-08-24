import { fingerprint } from "./hash.js";
import type {
  ArtifactSnapshot,
  ProvenanceBundle,
  ProvenanceRecord,
  ProvenanceWriter,
} from "../types.js";

export type { ProvenanceWriter } from "../types.js";

export function createMemoryProvenance(): ProvenanceWriter {
  const records: ProvenanceRecord[] = [];
  let seq = 0;

  return {
    append(r) {
      const rec: ProvenanceRecord = {
        ...r,
        id: `prov_${++seq}`,
        ts: r.ts ?? Date.now(),
      };
      records.push(rec);
      return rec;
    },
    list(sessionId) {
      return records.filter((r) => r.sessionId === sessionId);
    },
    listAll() {
      return [...records];
    },
    exportBundle(sessionId) {
      const list = records.filter((r) => r.sessionId === sessionId);
      const bundle: ProvenanceBundle = {
        version: 1,
        exportedAt: Date.now(),
        sessionId,
        records: list,
      };
      return bundle;
    },
    clear(sessionId) {
      if (!sessionId) {
        records.length = 0;
        return;
      }
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]!.sessionId === sessionId) records.splice(i, 1);
      }
    },
  };
}

export function attachBundleExtras(
  bundle: ProvenanceBundle,
  extras: {
    latestSource?: string;
    latestSvg?: string;
    snapshot?: ArtifactSnapshot;
  },
): ProvenanceBundle {
  return { ...bundle, ...extras };
}

export function dataFingerprints(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") return { root: fingerprint(data) };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    out[k] = fingerprint(v);
  }
  return out;
}
