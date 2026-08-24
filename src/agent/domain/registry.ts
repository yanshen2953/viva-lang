import type { VivaSession } from "../session.js";
import type {
  DomainSelection,
  PipelineArtifact,
} from "../types.js";
import type { VivaAgentHost } from "../host.js";
import {
  applyInlineEmbedChrome,
  INLINE_DEFAULT_HANDBOOKS,
  VIVA_INLINE_PLUGIN_ID,
} from "../../embed/inline-styles.js";
import {
  inlineCheckLines,
  inlineCheckStripOf,
  paintInlineCheckStrip,
} from "../../embed/inline-check.js";
import { runBrowserVisual } from "../../check/browser-visual.js";

export type DomainBridge = {
  pushToViva(path: string, value: unknown): void;
  subscribeViva(path: string, cb: (v: unknown) => void): () => void;
  setDomainSelection(sel: DomainSelection): void;
  onDomainSelection(cb: (sel: DomainSelection) => void): () => void;
};

export type DomainViewContext = {
  session: VivaSession;
  host: VivaAgentHost;
  bridge: DomainBridge;
};

export type DomainViewInstance = {
  load(resource: { uri: string; mediaType: string }): Promise<void>;
  setSelection?(sel: DomainSelection): void;
  onSelection?(cb: (sel: DomainSelection) => void): () => void;
  dispose(): void;
};

export type DomainView = {
  id: string;
  title: string;
  accept: string[];
  mount(el: HTMLElement, ctx: DomainViewContext): DomainViewInstance;
};

export type DomainViewRegistry = {
  register(view: DomainView): void;
  unregister(id: string): void;
  list(): DomainView[];
  resolve(mediaType: string): DomainView | undefined;
  open(opts: {
    viewId?: string;
    mediaType?: string;
    resource: { uri: string; mediaType: string };
    session: VivaSession;
    mount: HTMLElement;
  }): Promise<DomainViewInstance>;
};

export function createDomainViewRegistry(host: () => VivaAgentHost): DomainViewRegistry {
  const views = new Map<string, DomainView>();

  const registry: DomainViewRegistry = {
    register(view) {
      views.set(view.id, view);
    },
    unregister(id) {
      views.delete(id);
    },
    list() {
      return [...views.values()];
    },
    resolve(mediaType) {
      for (const view of views.values()) {
        if (view.accept.some((a) => matchMedia(a, mediaType))) return view;
      }
      return undefined;
    },
    async open(opts) {
      const view =
        (opts.viewId ? views.get(opts.viewId) : undefined) ??
        registry.resolve(opts.mediaType ?? opts.resource.mediaType);
      if (!view) {
        throw new Error(
          `no domain view for ${opts.viewId ?? opts.resource.mediaType}`,
        );
      }
      const selectionListeners = new Set<(sel: DomainSelection) => void>();
      const bridge: DomainBridge = {
        pushToViva(path, value) {
          if (path.startsWith("state.") || !path.includes(".")) {
            opts.session.setState(path.replace(/^state\./, ""), value);
          } else if (path.startsWith("data.")) {
            opts.session.setData(path.slice(5), value);
          } else {
            opts.session.setState(path, value);
          }
        },
        subscribeViva(path, cb) {
          return opts.session.watch(path, cb);
        },
        setDomainSelection(sel) {
          for (const cb of selectionListeners) cb(sel);
          host().events.emit({
            type: "domain-selection",
            sessionId: opts.session.id,
            detail: sel,
          });
        },
        onDomainSelection(cb) {
          selectionListeners.add(cb);
          return () => selectionListeners.delete(cb);
        },
      };
      const instance = view.mount(opts.mount, {
        session: opts.session,
        host: host(),
        bridge,
      });
      await instance.load(opts.resource);
      return instance;
    },
  };

  registry.register(createVivaInlineView());
  registry.register(createImageView());
  registry.register(createIframeView());
  registry.register(createJsonTableView());
  return registry;
}

function matchMedia(accept: string, mediaType: string): boolean {
  if (accept === mediaType) return true;
  if (accept.endsWith("/*")) {
    return mediaType.startsWith(accept.slice(0, -1));
  }
  return false;
}

async function loadVivaSourceFromUri(uri: string): Promise<string> {
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma < 0) throw new Error("invalid data uri");
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    if (meta.includes(";base64")) {
      return Buffer.from(payload, "base64").toString("utf8");
    }
    return decodeURIComponent(payload);
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`failed to load viva source: ${res.status}`);
  return await res.text();
}

/** Default inline plugin: print-nature card + interactive Runtime. */
function createVivaInlineView(): DomainView {
  return {
    id: VIVA_INLINE_PLUGIN_ID,
    title: "Viva Inline",
    accept: [
      "application/vnd.viva",
      "text/x-viva",
      "viva/source",
      "viva/*",
    ],
    mount(el, ctx) {
      el.innerHTML = "";
      const stage = applyInlineEmbedChrome(el);
      const inlineSession = ctx.host.createSession({
        mount: stage,
        handbooks: [...INLINE_DEFAULT_HANDBOOKS],
        statePolicy: "preserve-data",
      });
      const unsub = inlineSession.on("user-interact", () => {
        ctx.bridge.pushToViva("inlineActive", true);
      });
      return {
        async load(resource) {
          const source = await loadVivaSourceFromUri(resource.uri);
          const compiled = inlineSession.compile(source, {
            reason: "generate",
            handbooks: [...INLINE_DEFAULT_HANDBOOKS],
          });
          const strip = inlineCheckStripOf(el);
          if (strip) {
            const notes = [...compiled.diagnostics];
            if (compiled.ir) {
              try {
                notes.push(...runBrowserVisual(compiled.ir));
              } catch {
                /* browser visual may fail success; strip still paints */
              }
            }
            paintInlineCheckStrip(strip, inlineCheckLines(notes, compiled.error));
          }
        },
        dispose() {
          unsub();
          inlineSession.dispose();
          el.innerHTML = "";
        },
      };
    },
  };
}

function createImageView(): DomainView {
  return {
    id: "builtin.image",
    title: "Image",
    accept: ["image/*"],
    mount(el, ctx) {
      el.innerHTML = "";
      const img = document.createElement("img");
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.alt = "domain";
      el.appendChild(img);
      img.addEventListener("click", () => {
        ctx.bridge.setDomainSelection({
          kind: "image",
          ids: [img.src],
          payload: { src: img.src },
        });
        ctx.bridge.pushToViva("selectedId", img.src);
      });
      return {
        async load(resource) {
          img.src = resource.uri;
        },
        dispose() {
          el.innerHTML = "";
        },
      };
    },
  };
}

function createIframeView(): DomainView {
  return {
    id: "builtin.iframe",
    title: "IFrame",
    accept: ["text/html", "application/x-iframe"],
    mount(el) {
      el.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.border = "0";
      el.appendChild(frame);
      return {
        async load(resource) {
          frame.src = resource.uri;
        },
        dispose() {
          el.innerHTML = "";
        },
      };
    },
  };
}

function createJsonTableView(): DomainView {
  return {
    id: "builtin.json-table",
    title: "JSON Table",
    accept: ["application/json", "text/csv", "text/tab-separated-values"],
    mount(el, ctx) {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "overflow:auto;max-height:100%;font:12px/1.45 ui-monospace,SFMono-Regular,monospace";
      el.appendChild(wrap);
      return {
        async load(resource) {
          const text = await loadVivaSourceFromUri(resource.uri);
          const { headers, rows } = parseTable(text, resource.mediaType);
          wrap.innerHTML = "";
          const table = document.createElement("table");
          table.style.cssText = "border-collapse:collapse;width:100%";
          const thead = document.createElement("thead");
          const hr = document.createElement("tr");
          for (const h of headers) {
            const th = document.createElement("th");
            th.textContent = h;
            th.style.cssText = "text-align:left;padding:4px 8px;border-bottom:1px solid #cbd5e1";
            hr.appendChild(th);
          }
          thead.appendChild(hr);
          table.appendChild(thead);
          const tbody = document.createElement("tbody");
          rows.forEach((row, i) => {
            const tr = document.createElement("tr");
            tr.style.cursor = "pointer";
            for (const h of headers) {
              const td = document.createElement("td");
              td.textContent = stringifyCell(row[h]);
              td.style.cssText = "padding:4px 8px;border-bottom:1px solid #e2e8f0";
              tr.appendChild(td);
            }
            tr.addEventListener("click", () => {
              const id = String(row.id ?? row.name ?? i);
              ctx.bridge.setDomainSelection({
                kind: "row",
                ids: [id],
                payload: row,
              });
              ctx.bridge.pushToViva("selectedId", id);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          wrap.appendChild(table);
        },
        dispose() {
          el.innerHTML = "";
        },
      };
    },
  };
}

function parseTable(
  text: string,
  mediaType: string,
): { headers: string[]; rows: Record<string, unknown>[] } {
  if (mediaType.includes("csv") || mediaType.includes("tab-separated")) {
    const sep = mediaType.includes("tab") ? "\t" : ",";
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const headers = (lines[0] ?? "").split(sep).map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(sep);
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i]?.trim() ?? "";
      });
      return row;
    });
    return { headers, rows };
  }
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    const rows = parsed.map((item) =>
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : { value: item },
    );
    const headerSet = new Set<string>();
    for (const row of rows) for (const k of Object.keys(row)) headerSet.add(k);
    return { headers: [...headerSet], rows };
  }
  if (parsed && typeof parsed === "object") {
    const rows = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      value: v,
    }));
    return { headers: ["key", "value"], rows };
  }
  return { headers: ["value"], rows: [{ value: parsed }] };
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Suggest opening a domain view for a pipeline artifact (host UI helper). */
export function suggestViewForArtifact(
  registry: DomainViewRegistry,
  artifact: PipelineArtifact,
): DomainView | undefined {
  if (artifact.suggestDomainView) {
    return registry.list().find((v) => v.id === artifact.suggestDomainView);
  }
  if (/viva/i.test(artifact.mediaType) || artifact.mediaType === "application/vnd.viva") {
    return registry.list().find((v) => v.id === VIVA_INLINE_PLUGIN_ID);
  }
  if (
    artifact.mediaType === "application/json" ||
    artifact.mediaType === "text/csv" ||
    artifact.mediaType === "text/tab-separated-values"
  ) {
    return registry.list().find((v) => v.id === "builtin.json-table");
  }
  return registry.resolve(artifact.mediaType);
}

export { VIVA_INLINE_PLUGIN_ID } from "../../embed/inline-styles.js";
