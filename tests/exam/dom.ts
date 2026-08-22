import type { VisualIR } from "../../src/ir.js";
import type { LayerIR } from "../../src/ir.js";
import type { Expr } from "../../src/ast.js";
import { evaluate } from "../../src/eval.js";
import { applyBlend, ensureDefs, resolveFilter } from "../../src/paint.js";

/**
 * Minimal in-memory SVG document used by the exam tests.
 *
 * The host language is a client library whose Runtime relies on real SVG APIs
 * (`createSVGPoint`, `getScreenCTM`, `viewBox.baseVal`) that cannot run under a
 * bare `node` vitest environment and are not polyfilled by jsdom. This helper
 * implements just enough of the DOM surface that the *paint* layer
 * (`ensureDefs` / `resolveFilter` / `applyBlend`) and the layer-group assembly
 * of `Runtime.render` touch, so we can assert the emitted SVG document
 * structure (z-order, opacity, visible, blend, filter) without a browser.
 */
export class FakeElement {
  tagName: string;
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private text = "";

  constructor(tag: string) {
    this.tagName = tag;
  }

  get id(): string {
    return this.attrs.get("id") ?? "";
  }
  set id(v: string) {
    this.attrs.set("id", v);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child: FakeElement, ref: FakeElement | null): FakeElement {
    child.parent = this;
    const index = ref ? this.children.indexOf(ref) : this.children.length;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  set textContent(v: string) {
    this.text = v;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set innerHTML(_: string) {
    this.children = [];
  }

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  querySelector(sel: string): FakeElement | null {
    if (sel.startsWith(":scope > ")) {
      const rest = sel.slice(":scope > ".length);
      for (const child of this.children) if (matchesChild(child, rest)) return child;
      return null;
    }
    if (sel.startsWith("#")) {
      return findById(this, sel.slice(1));
    }
    return findById(this, sel.replace(/^#/, "")) ?? findFirstMatching(this, sel);
  }

  querySelectorAll(sel: string): FakeElement[] {
    const out: FakeElement[] = [];
    if (sel.startsWith(":scope > ")) {
      const rest = sel.slice(":scope > ".length);
      for (const child of this.children) if (matchesChild(child, rest)) out.push(child);
      return out;
    }
    collectMatching(this, sel, out);
    return out;
  }
}

function findById(root: FakeElement, id: string): FakeElement | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const r = findById(child, id);
    if (r) return r;
  }
  return null;
}

function matchesChild(el: FakeElement, sel: string): boolean {
  if (!sel.includes("[")) return el.tagName === sel;
  const m = sel.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
  if (!m) return false;
  const [, name, value] = m;
  if (value !== undefined) return el.getAttribute(name) === value;
  return el.hasAttribute(name);
}

function findFirstMatching(el: FakeElement, sel: string): FakeElement | null {
  if (matchesArbitrary(el, sel)) return el;
  for (const child of el.children) {
    const r = findFirstMatching(child, sel);
    if (r) return r;
  }
  return null;
}

function matchesArbitrary(el: FakeElement, sel: string): boolean {
  const m = sel.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
  if (!m) return el.tagName === sel;
  const [, name, value] = m;
  if (value !== undefined) return el.getAttribute(name) === value;
  return el.hasAttribute(name);
}

function collectMatching(el: FakeElement, sel: string, out: FakeElement[]): void {
  if (matchesArbitrary(el, sel)) out.push(el);
  for (const child of el.children) collectMatching(child, sel, out);
}

/**
 * A tiny stand-in for `document` so the real paint helpers can run in node.
 * Set as `globalThis.document` before any paint call.
 */
export const documentLike = {
  createElementNS(_ns: string, tag: string): FakeElement {
    return new FakeElement(tag);
  },
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  },
};

/** Install the fake document as the global `document` (harmless under node). */
export function installDom(): void {
  (globalThis as unknown as { document: unknown }).document = documentLike;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function evaluateProps(
  props: Record<string, Expr>,
  scopes: [Record<string, unknown>, Record<string, unknown>],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(props)) {
    out[key] = evaluate(expr, scopes);
  }
  return out;
}

export type GroupSnapshot = {
  id: string;
  name: string;
  order: number;
  opacity: string | null;
  display: string;
  blend: string;
  filter: string | null;
};

/**
 * Build the layer-group document structure the Runtime produces, using the real
 * paint helpers (`ensureDefs`, `applyBlend`, `resolveFilter`). Layers are
 * appended to the `<svg>` in IR declaration order, so later siblings paint on
 * top (z-order). Returns snapshots for assertion.
 */
export function mountLayers(ir: VisualIR): {
  svg: FakeElement;
  defs: FakeElement;
  groups: FakeElement[];
  snapshots: GroupSnapshot[];
} {
  installDom();
  const svg = new FakeElement("svg");
  const defs = ensureDefs(svg as unknown as SVGElement) as unknown as FakeElement;
  const scopes: [Record<string, unknown>, Record<string, unknown>] = [ir.state, ir.data];
  const groups: FakeElement[] = [];

  for (const layer of ir.scene.layers) {
    const group = new FakeElement("g");
    group.setAttribute("data-viva-layer-id", layer.id);
    group.setAttribute("data-viva-layer", layer.name);
    svg.appendChild(group);
    groups.push(group);

    const lp = evaluateProps(layer.props ?? {}, scopes);
    const opacity = lp.opacity === undefined ? 1 : num(lp.opacity, 1);
    const visible = lp.visible === undefined ? true : Boolean(lp.visible);
    group.style.display = visible ? "" : "none";
    group.setAttribute("opacity", String(opacity));
    applyBlend(group as unknown as SVGElement, lp);

    if (lp.blur !== undefined || lp.glow !== undefined) {
      const filter = resolveFilter(defs as unknown as SVGDefsElement, `layer_${layer.id}`, lp);
      if (filter) group.setAttribute("filter", filter);
      else group.removeAttribute("filter");
    } else {
      group.removeAttribute("filter");
    }
  }

  const snapshots: GroupSnapshot[] = groups.map((g, index) => ({
    id: g.getAttribute("data-viva-layer-id") ?? "",
    name: g.getAttribute("data-viva-layer") ?? "",
    order: index,
    opacity: g.getAttribute("opacity"),
    display: g.style.display ?? "",
    blend: g.style.mixBlendMode ?? "",
    filter: g.getAttribute("filter"),
  }));

  return { svg, defs, groups, snapshots };
}

/** All filter ids defined in the scene `<defs>`. */
export function defsFilterIds(defs: FakeElement): string[] {
  return defs.children.filter((c) => c.tagName === "filter" && c.id).map((c) => c.id);
}

/** Map of filter id -> [primitive tagNames] for asserting feGaussianBlur/feFlood. */
export function filterPrimitives(defs: FakeElement): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const filter of defs.children.filter((c) => c.tagName === "filter")) {
    if (!filter.id) continue;
    out[filter.id] = filter.children.map((c) => c.tagName);
  }
  return out;
}

export function layerSnapshotByName(
  snapshots: GroupSnapshot[],
  name: string,
): GroupSnapshot | undefined {
  return snapshots.find((s) => s.name === name);
}

export function layerPropsByName(ir: VisualIR, name: string): Record<string, unknown> {
  const layer = findLayer(ir, name);
  if (!layer) return {};
  return evaluateProps(layer.props ?? {}, [ir.state, ir.data]);
}

export function findLayer(ir: VisualIR, name: string): LayerIR | null {
  return ir.scene.layers.find((l) => l.name === name) ?? null;
}

/** Evaluate a node's props within a named layer (for asserting anchors etc.). */
export function nodePropsByName(
  ir: VisualIR,
  layerName: string,
  nodeName: string,
): Record<string, unknown> {
  const layer = findLayer(ir, layerName);
  if (!layer) return {};
  const item = layer.items.find((i) => i.kind === "node" && i.name === nodeName);
  if (!item || item.kind !== "node") return {};
  return evaluateProps(item.props, [ir.state, ir.data]);
}
