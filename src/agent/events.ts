import type { HostEvent, HostEventType } from "./types.js";

export type HostEventBus = {
  on(type: HostEventType | "*", cb: (e: HostEvent) => void): () => void;
  emit(e: Omit<HostEvent, "ts"> & { ts?: number }): void;
};

export function createEventBus(): HostEventBus {
  const listeners = new Map<string, Set<(e: HostEvent) => void>>();

  return {
    on(type, cb) {
      const key = type;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(cb);
      return () => listeners.get(key)?.delete(cb);
    },
    emit(e) {
      const event: HostEvent = { ...e, ts: e.ts ?? Date.now() };
      for (const cb of listeners.get(event.type) ?? []) cb(event);
      for (const cb of listeners.get("*") ?? []) cb(event);
    },
  };
}
