import type { VivaSession } from "./session.js";
import type {
  DomainSelection,
  PipelineArtifact,
} from "./types.js";

type HostLike = {
  events: {
    emit(e: { type: "domain-selection"; sessionId?: string; detail?: unknown }): void;
  };
};

export type DomainBridge = {
  pushToViva(path: string, value: unknown): void;
  subscribeViva(path: string, cb: (v: unknown) => void): () => void;
  setDomainSelection(sel: DomainSelection): void;
  onDomainSelection(cb: (sel: DomainSelection) => void): () => void;
};

export type DomainViewContext = {
  session: VivaSession;
  host: HostLike;
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

export function createDomainViewRegistry(host: () => HostLike): DomainViewRegistry {
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

  registry.register(createImageView());
  registry.register(createIframeView());
  return registry;
}

function matchMedia(accept: string, mediaType: string): boolean {
  if (accept === mediaType) return true;
  if (accept.endsWith("/*")) {
    return mediaType.startsWith(accept.slice(0, -1));
  }
  return false;
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

/** Suggest opening a domain view for a pipeline artifact (host UI helper). */
export function suggestViewForArtifact(
  registry: DomainViewRegistry,
  artifact: PipelineArtifact,
): DomainView | undefined {
  if (artifact.suggestDomainView) {
    return registry.list().find((v) => v.id === artifact.suggestDomainView);
  }
  return registry.resolve(artifact.mediaType);
}
