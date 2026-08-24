import type { Expr } from "./ast.js";
import { cloneValue, evaluate, execute, truthy, type Scope } from "./eval.js";
import type { SceneNodeIR, VisualIR } from "./ir.js";
import {
  applyBlend,
  applyDash,
  applyTransform,
  applyTypography,
  ensureDefs,
  resolveFill,
  resolveFilter,
} from "./paint.js";
import {
  applyFrameToProps,
  layoutChartGeom,
  prepareChartGeom,
  scalesFromFrameProps,
  type FrameScales,
} from "./space.js";
import { propsToBBox as nodePropsToBBox } from "./layout/node-bbox.js";
import {
  evalSceneProps,
  resolveSceneBox,
  scaleSceneGeom,
  sceneScaleOf,
  viewBoxToScene,
} from "./space/scene-box.js";
import { DEFAULT_SCENE_BACKGROUND, resetPaletteSeries, setStyleContext } from "./style/index.js";
import { STYLE_META_PROPS } from "./style/types.js";
import {
  applyMarkPaintCss,
  isSummaryMark,
  markPaintState,
  pickGeom,
  sampleGeomEase,
  samplePathEase,
  type GeomTween,
  type PathTween,
} from "./runtime/mark-ease.js";
import { nodeIgnoresPointer } from "./runtime/pointer.js";
import { applyTimelineState, holdOf, startOfBeat } from "./timeline/clock.js";
import { applyViewState } from "./runtime/view-machine.js";

export { nodeIgnoresPointer };

export type RuntimeOptions = {
  mount: HTMLElement;
  ir: VisualIR;
};

type RenderNode = {
  id: string;
  name: string;
  group?: string;
  layerId: string;
  layerName: string;
  props: Record<string, unknown>;
  item?: unknown;
};

type PointerScene = {
  x: number;
  y: number;
  t: number;
  px: number;
  py: number;
};

type DragState = {
  node: RenderNode;
  pointerId: number;
  grabDx: number;
  grabDy: number;
  moved: boolean;
  originX: number;
  originY: number;
};

type HitShape =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number };

/**
 * Game-oriented runtime: click/hover/drag/dragend/collide/key + tick.
 * __event.x/y are author scene units (mm when unit: mm). px/py stay viewBox CSS px.
 */
export class Runtime {
  private readonly ir: VisualIR;
  private readonly mount: HTMLElement;
  private readonly state: Record<string, unknown>;
  private readonly data: Record<string, unknown>;
  private svg: SVGSVGElement | null = null;
  private animFrame = 0;
  private lastTick = 0;
  private lastClock = 0;
  private running = false;
  private hoverId: string | null = null;
  private time = 0;
  private drag: DragState | null = null;
  private activeCollisions = new Set<string>();
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private lastNodes: RenderNode[] = [];
  private hideTimers = new Map<string, number>();
  private geomTweens = new Map<string, GeomTween>();
  private geomShown = new Map<string, Record<string, number>>();
  private pathTweens = new Map<string, PathTween>();
  private pathShown = new Map<string, string>();

  constructor(options: RuntimeOptions) {
    this.ir = options.ir;
    this.mount = options.mount;
    this.state = cloneValue(options.ir.state);
    this.data = cloneValue(options.ir.data);
  }

  start(): void {
    this.stop();
    this.lastClock = 0;
    if (this.ir.meta) {
      setStyleContext({ meta: this.ir.meta });
      resetPaletteSeries(this.ir.meta);
    } else {
      setStyleContext(null);
    }
    this.mount.innerHTML = "";
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "viva-scene");
    this.svg.style.touchAction = "none";
    this.svg.tabIndex = 0;
    this.applySceneBox();
    this.mount.appendChild(this.svg);
    this.bindPointer();
    this.bindKeys();
    this.applyBinds();
    this.applyRules();
    this.render();
    this.applyEnterAnimations();
    this.running = true;
    this.lastTick = performance.now();
    this.loop(this.lastTick);
    this.svg.focus({ preventScroll: true });
  }

  stop(): void {
    setStyleContext(null);
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = 0;
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.drag = null;
    this.activeCollisions.clear();
    for (const id of this.hideTimers.values()) window.clearTimeout(id);
    this.hideTimers.clear();
  }

  getWorld(): { state: Record<string, unknown>; data: Record<string, unknown> } {
    return { state: this.state, data: this.data };
  }

  exportSvg(): string {
    return this.svg?.outerHTML ?? "";
  }

  /** Live SVG root (for review overlay / selection tools). */
  getSvg(): SVGSVGElement | null {
    return this.svg;
  }

  /** Client → scene (viewBox) coordinates. */
  scenePoint(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.svg) return { x: 0, y: 0 };
    const fake = {
      clientX,
      clientY,
    } as PointerEvent;
    const p = this.pointerToScene(fake);
    return { x: p.x, y: p.y };
  }

  /** Hit-test painted node under client coords (element pick). */
  hitTest(clientX: number, clientY: number): {
    id: string;
    name: string;
    group?: string;
    layerId: string;
    layerName: string;
    bbox: { x: number; y: number; w: number; h: number };
  } | null {
    if (!this.svg) return null;
    const el = document.elementFromPoint(clientX, clientY);
    const hit = el?.closest?.("[data-viva-id]");
    if (!hit) return null;
    const id = hit.getAttribute("data-viva-id");
    if (!id) return null;
    const node = this.lastNodes.find((n) => n.id === id) ?? this.flatten().find((n) => n.id === id);
    if (!node) return null;
    return renderNodeToSelected(node);
  }

  /** Catalog of currently painted nodes with bboxes (id-aligned with static SVG). */
  listPaintedNodes(): {
    id: string;
    name: string;
    group?: string;
    layerId: string;
    layerName: string;
    bbox: { x: number; y: number; w: number; h: number };
  }[] {
    const nodes = this.lastNodes.length ? this.lastNodes : this.flatten();
    return nodes.map((node) => {
      const base = renderNodeToSelected(node);
      const el = this.svg?.querySelector(`[data-viva-id="${css(node.id)}"]`) as SVGGraphicsElement | null;
      if (el && typeof el.getBBox === "function") {
        try {
          const b = el.getBBox();
          if (b.width > 0 || b.height > 0) {
            base.bbox = { x: b.x, y: b.y, w: Math.max(b.width, 1), h: Math.max(b.height, 1) };
          }
        } catch {
          /* detached */
        }
      }
      return base;
    });
  }

  setData(path: string, value: unknown): void {
    setDeep(this.data, path.split(".").filter(Boolean), value);
  }

  setState(path: string, value: unknown): void {
    setDeep(this.state, path.split(".").filter(Boolean), value);
  }

  replaceWorld(next: {
    state?: Record<string, unknown>;
    data?: Record<string, unknown>;
  }): void {
    if (next.state) {
      clearRecord(this.state);
      Object.assign(this.state, cloneValue(next.state));
    }
    if (next.data) {
      clearRecord(this.data);
      Object.assign(this.data, cloneValue(next.data));
    }
  }

  private frameScales(): FrameScales[] {
    const sceneScale = sceneScaleOf(evalSceneProps(this.ir.scene.props, this.scopes()));
    return (this.ir.frames ?? []).map((frame) =>
      scalesFromFrameProps(frame.name, evalProps(frame.props, this.scopes()), sceneScale),
    );
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.time = now;
    const spec = this.ir.timeline;
    if (spec) {
      const dt = this.lastClock ? (now - this.lastClock) / 1000 : 0;
      this.lastClock = now;
      const t = Number(this.state.__t ?? 0) + dt;
      applyTimelineState(this.state, spec, t);
    }
    for (const tick of this.ir.ticks) {
      const interval = 1000 / Math.max(tick.fps, 1);
      if (now - this.lastTick >= interval) {
        execute(tick.body, this.scopes());
        this.lastTick = now;
      }
    }
    this.applyBinds();
    this.applyRules();
    applyViewState(this.state, {
      playing: Boolean(spec) && this.running,
      paused: Boolean(spec) && !this.running,
      hovering: Boolean(this.hoverId),
      dragging: Boolean(this.drag),
    });
    this.render();
    this.resolveCollisions();
    this.animFrame = requestAnimationFrame(this.loop);
  };

  private scopes(extra?: Scope): Scope[] {
    return extra ? [extra, this.state, this.data] : [this.state, this.data];
  }

  private applyBinds(): void {
    for (const bind of this.ir.binds) {
      execute(
        [{ kind: "assign", target: bind.target, value: bind.source, span: { line: 1, column: 1 } }],
        this.scopes(),
      );
    }
  }

  private applyRules(): void {
    for (const rule of this.ir.rules) {
      if (truthy(evaluate(rule.cond, this.scopes()))) {
        execute(rule.body, this.scopes());
      }
    }
  }

  private applySceneBox(): void {
    if (!this.svg) return;
    const props = evalSceneProps(this.ir.scene.props, this.scopes());
    const box = resolveSceneBox(props);
    this.svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");
    this.svg.style.background = box.background;
  }

  private flatten(): RenderNode[] {
    const nodes: RenderNode[] = [];
    for (const layer of this.ir.scene.layers) {
      this.flattenItems(
        layer.items,
        this.scopes(),
        nodes,
        layer.name,
        layer.id,
        layer.name,
        undefined,
      );
    }
    this.lastNodes = nodes;
    return nodes;
  }

  private flattenItems(
    items: SceneNodeIR[],
    scopes: Scope[],
    out: RenderNode[],
    prefix: string,
    layerId: string,
    layerName: string,
    currentItem: unknown,
  ): void {
    for (const item of items) {
      if (item.kind === "node") {
        const raw = scaleSceneGeom(
          prepareChartGeom(evalProps(item.props, scopes), {
            data: this.ir.data as Record<string, unknown>,
            state: this.scopes()[0] as Record<string, unknown>,
          }),
          sceneScaleOf(evalSceneProps(this.ir.scene.props, scopes)),
        );
        const framed = applyFrameToProps(raw, this.frameScales());
        const props = layoutChartGeom(framed, this.frameScales());
        out.push({
          id: `${prefix}:${item.id}`,
          name: item.name,
          group: item.group,
          layerId,
          layerName,
          props,
          item: currentItem,
        });
        continue;
      }
      if (item.kind === "if") {
        if (truthy(evaluate(item.cond, scopes))) {
          this.flattenItems(
            item.body,
            scopes,
            out,
            `${prefix}:${item.id}`,
            layerId,
            layerName,
            currentItem,
          );
        }
        continue;
      }
      const source = evaluate(item.source, scopes);
      const list = Array.isArray(source) ? source : [];
      list.forEach((entry, index) => {
        this.flattenItems(
          item.body,
          [{ [item.item]: entry }, ...scopes],
          out,
          `${prefix}:${item.id}:${index}`,
          layerId,
          layerName,
          entry,
        );
      });
    }
  }

  private render(): void {
    if (!this.svg) return;
    this.applySceneBox();
    const defs = ensureDefs(this.svg);
    const nodes = this.flatten();
    const used = new Set<string>();
    const usedLayers = new Set<string>();

    // Ensure layer groups exist in scene order (z-order = declaration order).
    for (const layer of this.ir.scene.layers) {
      usedLayers.add(layer.id);
      let group = this.svg.querySelector(
        `:scope > g[data-viva-layer-id="${css(layer.id)}"]`,
      ) as SVGGElement | null;
      if (!group) {
        group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("data-viva-layer-id", layer.id);
        group.setAttribute("data-viva-layer", layer.name);
        this.svg.appendChild(group);
      }
      group.setAttribute("data-viva-layer", layer.name);
      const layerProps = evalProps(layer.props ?? {}, this.scopes());
      const opacity = layerProps.opacity === undefined ? 1 : num(layerProps.opacity, 1);
      const visible = layerProps.visible === undefined ? true : Boolean(layerProps.visible);
      group.style.display = visible ? "" : "none";
      group.setAttribute("opacity", String(opacity));
      applyBlend(group, layerProps);
      if (layerProps.blur !== undefined || layerProps.glow !== undefined) {
        const filter = resolveFilter(defs, `layer_${layer.id}`, layerProps);
        if (filter) group.setAttribute("filter", filter);
        else group.removeAttribute("filter");
      } else {
        group.removeAttribute("filter");
      }
    }

    for (const node of nodes) {
      used.add(node.id);
      const layerGroup = this.svg.querySelector(
        `:scope > g[data-viva-layer-id="${css(node.layerId)}"]`,
      ) as SVGGElement | null;
      const parent = layerGroup ?? this.svg;
      let el = parent.querySelector(`[data-viva-id="${css(node.id)}"]`) as SVGElement | null;
      if (!el) {
        // Node may have moved layers — remove stale copy then recreate.
        const stale = this.svg.querySelector(`[data-viva-id="${css(node.id)}"]`);
        stale?.remove();
        el = this.createElement(node);
        parent.appendChild(el);
      } else if ((el.parentNode as Element | null) !== parent) {
        parent.appendChild(el);
      }
      this.updateElement(el, node, defs);
    }

    for (const child of Array.from(this.svg.querySelectorAll("[data-viva-id]"))) {
      const id = child.getAttribute("data-viva-id");
      if (id && !used.has(id)) child.remove();
    }
    for (const group of Array.from(this.svg.querySelectorAll(":scope > g[data-viva-layer-id]"))) {
      const id = group.getAttribute("data-viva-layer-id");
      if (id && !usedLayers.has(id)) group.remove();
    }
  }

  private createElement(node: RenderNode): SVGElement {
    const tag = inferTag(node.props);
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    el.setAttribute("data-viva-id", node.id);
    el.setAttribute("data-viva-name", node.name);
    if (node.group) el.setAttribute("data-viva-group", node.group);
    el.style.cursor = this.isDraggable(node) ? "grab" : "pointer";
    return el;
  }

  private updateElement(el: SVGElement, node: RenderNode, defs: SVGDefsElement): void {
    const raw = node.props;
    const p =
      isSummaryMark(raw) && this.drag?.node.id !== node.id
        ? this.easeSummaryGeom(node.id, raw)
        : raw;
    const x = num(p.x, 0);
    const y = num(p.y, 0);
    const opacity = p.opacity === undefined ? 1 : num(p.opacity, 1);
    const visible = p.visible === undefined ? true : Boolean(p.visible);
    const hovered = this.hoverId === node.id;
    const scale = Array.isArray(p.scale)
      ? num(p.scale[0], 1)
      : p.scale === undefined
        ? 1
        : num(p.scale, 1);
    const paint = markPaintState(visible, opacity, scale);
    applyMarkPaintCss(el, paint);
    if (nodeIgnoresPointer(node.name, p.role)) el.style.pointerEvents = "none";
    const prevHide = this.hideTimers.get(node.id);
    if (prevHide) window.clearTimeout(prevHide);
    if (paint.hideAfterMs !== null) {
      this.hideTimers.set(
        node.id,
        window.setTimeout(() => {
          if (el.getAttribute("opacity") === "0") el.style.display = "none";
          this.hideTimers.delete(node.id);
        }, paint.hideAfterMs) as unknown as number,
      );
    } else {
      this.hideTimers.delete(node.id);
    }
    el.setAttribute("data-viva-name", node.name);
    if (node.group) el.setAttribute("data-viva-group", node.group);
    el.style.cursor =
      this.drag?.node.id === node.id ? "grabbing" : this.isDraggable(node) ? "grab" : "pointer";

    const fill = resolveFill(
      defs,
      node.id,
      p,
      hovered,
      el.tagName === "rect"
        ? DEFAULT_SCENE_BACKGROUND
        : el.tagName === "text"
          ? "#1e293b"
          : "#0072B2",
    );
    const filter = resolveFilter(defs, node.id, p);
    if (filter) el.setAttribute("filter", filter);
    else el.removeAttribute("filter");
    applyBlend(el, p);
    applyDash(el, p);

    let anchorX = x;
    let anchorY = y;

    if (el.tagName === "circle") {
      el.setAttribute("cx", String(x));
      el.setAttribute("cy", String(y));
      el.setAttribute("r", String(num(p.r ?? p.size, 16)));
      el.setAttribute("fill", fill);
      if (p.stroke) el.setAttribute("stroke", String(p.stroke));
      else el.removeAttribute("stroke");
      if (p.strokeWidth) el.setAttribute("stroke-width", String(p.strokeWidth));
      else el.removeAttribute("stroke-width");
      anchorX = x;
      anchorY = y;
    } else if (el.tagName === "rect") {
      const w = num(p.w ?? p.width, 80);
      const h = num(p.h ?? p.height, 24);
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("width", String(w));
      el.setAttribute("height", String(h));
      el.setAttribute("rx", String(num(p.radius, 0)));
      el.setAttribute("fill", fill);
      if (p.stroke) el.setAttribute("stroke", String(p.stroke));
      else el.removeAttribute("stroke");
      if (p.strokeWidth) el.setAttribute("stroke-width", String(p.strokeWidth));
      else el.removeAttribute("stroke-width");
      anchorX = x + w / 2;
      anchorY = y + h / 2;
    } else if (el.tagName === "text") {
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("fill", hovered && p.hoverFill ? String(p.hoverFill) : str(p.fill ?? p.color, "#1e293b"));
      applyTypography(el as SVGTextElement, {
        ...p,
        text: p.text ?? p.label ?? node.name,
      });
      anchorX = x;
      anchorY = y;
    } else if (el.tagName === "line") {
      const x1 = num(p.x1, x);
      const y1 = num(p.y1, y);
      const x2 = num(p.x2, x + 40);
      const y2 = num(p.y2, y);
      el.setAttribute("x1", String(x1));
      el.setAttribute("y1", String(y1));
      el.setAttribute("x2", String(x2));
      el.setAttribute("y2", String(y2));
      el.setAttribute("stroke", str(p.stroke ?? p.fill, "#64748b"));
      el.setAttribute("stroke-width", String(num(p.strokeWidth, 2)));
      if (p.strokeLinecap) el.setAttribute("stroke-linecap", String(p.strokeLinecap));
      anchorX = (x1 + x2) / 2;
      anchorY = (y1 + y2) / 2;
    } else if (el.tagName === "path") {
      el.setAttribute("d", str(p.d ?? p.path, ""));
      el.setAttribute("fill", p.gradient || p.fill ? fill : str(p.fill, "none"));
      el.setAttribute("stroke", str(p.stroke, "#94a3b8"));
      if (p.strokeWidth) el.setAttribute("stroke-width", String(p.strokeWidth));
      anchorX = x;
      anchorY = y;
    }

    applyTransform(el, { ...p, scale: undefined }, { x: anchorX, y: anchorY });
  }

  private easeSummaryGeom(
    id: string,
    props: Record<string, unknown>,
  ): Record<string, unknown> {
    const now = this.time || 0;
    const target = pickGeom(props);
    const { values, running } = sampleGeomEase(
      this.geomShown.get(id),
      target,
      now,
      this.geomTweens.get(id),
    );
    this.geomShown.set(id, values);
    if (running) this.geomTweens.set(id, running);
    else this.geomTweens.delete(id);
    const next: Record<string, unknown> = { ...props, ...values };
    const targetD = typeof props.d === "string" ? props.d : typeof props.path === "string" ? props.path : "";
    if (targetD) {
      const eased = samplePathEase(this.pathShown.get(id), targetD, now, this.pathTweens.get(id));
      this.pathShown.set(id, eased.value);
      if (eased.running) this.pathTweens.set(id, eased.running);
      else this.pathTweens.delete(id);
      next.d = eased.value;
      if (typeof props.path === "string") next.path = eased.value;
    }
    return next;
  }

  private bindPointer(): void {
    if (!this.svg) return;

    this.svg.addEventListener("pointermove", (event) => {
      if (this.drag && event.pointerId === this.drag.pointerId) {
        this.onDragMove(event);
        return;
      }
      const target = this.targetOf(event);
      this.hoverId = target?.id ?? null;
      if (target) this.fire("hover", target, event);
      else {
        this.applyBinds();
        this.applyRules();
        this.render();
      }
    });

    this.svg.addEventListener("pointerdown", (event) => {
      const target = this.targetOf(event);
      if (!target) return;
      this.svg?.setPointerCapture(event.pointerId);
      this.fire("click", target, event);

      if (this.isDraggable(target) || this.hasHandler("drag", target) || this.hasHandler("dragend", target)) {
        const scene = this.pointerToScene(event);
        const anchor = this.sceneAnchorOf(target);
        this.drag = {
          node: target,
          pointerId: event.pointerId,
          grabDx: scene.x - anchor.x,
          grabDy: scene.y - anchor.y,
          moved: false,
          originX: anchor.x,
          originY: anchor.y,
        };
        this.fire("dragstart", target, event, {
          x: anchor.x,
          y: anchor.y,
          px: scene.px,
          py: scene.py,
          t: scene.t,
          dx: 0,
          dy: 0,
        });
      }
    });

    const endDrag = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const target = this.refreshNode(this.drag.node.id) ?? this.drag.node;
      const scene = this.pointerToScene(event);
      const x = scene.x - this.drag.grabDx;
      const y = scene.y - this.drag.grabDy;
      this.fire("dragend", target, event, {
        x,
        y,
        px: scene.px,
        py: scene.py,
        t: scene.t,
        dx: x - this.drag.originX,
        dy: y - this.drag.originY,
        moved: this.drag.moved,
      });
      // Allow a fresh collide enter after the grab ends.
      for (const key of [...this.activeCollisions]) {
        if (key.includes(target.id)) this.activeCollisions.delete(key);
      }
      this.drag = null;
      try {
        this.svg?.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    };

    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);
  }

  private bindKeys(): void {
    this.keyHandler = (event: KeyboardEvent) => {
      if (this.ir.timeline && (event.key === "n" || event.key === "N" || event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        const spec = this.ir.timeline;
        const cur = Number(this.state.__t ?? 0);
        const sample = applyTimelineState(this.state, spec, cur);
        const dir = event.key === "N" || event.key === "ArrowLeft" ? -1 : 1;
        const nextBeat = (sample.beat + dir + spec.beats) % spec.beats;
        applyTimelineState(this.state, spec, startOfBeat(spec, nextBeat) + holdOf(spec, nextBeat) * 0.05);
        event.preventDefault();
        this.applyBinds();
        this.applyRules();
        applyViewState(this.state, {
          playing: true,
          hovering: Boolean(this.hoverId),
          dragging: Boolean(this.drag),
        });
        this.render();
        return;
      }
      if (!this.running) return;
      const sceneNode: RenderNode = {
        id: "scene",
        name: "scene",
        layerId: "",
        layerName: "",
        props: {},
        item: null,
      };
      const extra: Scope = {
        __event: {
          key: event.key,
          code: event.code,
          repeat: event.repeat,
          x: 0,
          y: 0,
          t: 0,
        },
      };
      let handled = false;
      for (const handler of this.ir.events) {
        if (handler.type !== "key") continue;
        if (handler.target !== "scene" && handler.target !== "world") continue;
        execute(handler.body, this.scopes(extra));
        handled = true;
      }
      // Also allow key handlers on currently dragged / hovered node names.
      const focus = this.drag?.node ?? this.lastNodes.find((n) => n.id === this.hoverId);
      if (focus) {
        for (const handler of this.ir.events) {
          if (handler.type !== "key") continue;
          if (handler.target !== focus.name && handler.target !== focus.group) continue;
          execute(handler.body, this.scopes({ ...extra, [focus.name]: focus.item }));
          handled = true;
        }
      }
      if (handled) {
        event.preventDefault();
        this.applyBinds();
        this.applyRules();
        this.render();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  private onDragMove(event: PointerEvent): void {
    if (!this.drag) return;
    const target = this.refreshNode(this.drag.node.id) ?? this.drag.node;
    const scene = this.pointerToScene(event);
    const x = scene.x - this.drag.grabDx;
    const y = scene.y - this.drag.grabDy;
    const dx = x - this.drag.originX;
    const dy = y - this.drag.originY;
    if (Math.hypot(dx, dy) > 2) this.drag.moved = true;

    if (this.isDraggable(target) && isRecord(target.item)) {
      target.item.x = x;
      target.item.y = y;
    }

    this.fire("drag", target, event, {
      x,
      y,
      px: scene.px,
      py: scene.py,
      t: scene.t,
      dx,
      dy,
    });
  }

  private resolveCollisions(): void {
    // Godot-like: the actively dragged body does not generate new contacts mid-grab.
    const dragId = this.drag?.node.id;
    const solids = this.lastNodes.filter(
      (node) => this.isSolid(node) && node.id !== dragId,
    );
    const next = new Set<string>();

    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]!;
        const b = solids[j]!;
        if (!overlaps(this.shapeOf(a), this.shapeOf(b))) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        next.add(key);
        if (!this.activeCollisions.has(key)) {
          this.fireCollision(a, b);
          this.fireCollision(b, a);
        }
      }
    }
    this.activeCollisions = next;
  }

  private fireCollision(node: RenderNode, other: RenderNode): void {
    const extra: Scope = {
      __event: {
        x: num(node.props.x, 0),
        y: num(node.props.y, 0),
        t: 0,
        other: other.item ?? { name: other.name, id: other.id },
        otherName: other.name,
        otherGroup: other.group ?? null,
      },
      [node.name]: node.item,
    };
    if (isRecord(node.item)) {
      for (const [key, value] of Object.entries(node.item)) extra[key] = value;
    }
    let matched = false;
    for (const handler of this.ir.events) {
      if (handler.type !== "collide") continue;
      if (handler.target !== node.name && handler.target !== node.group) continue;
      execute(handler.body, this.scopes(extra));
      matched = true;
    }
    if (matched) {
      this.applyBinds();
      this.applyRules();
      this.render();
    }
  }

  private fire(
    type: string,
    node: RenderNode,
    event: PointerEvent,
    override?: Record<string, unknown>,
  ): void {
    const scene = this.pointerToScene(event);
    const payload = {
      x: scene.x,
      y: scene.y,
      px: scene.px,
      py: scene.py,
      t: scene.t,
      dx: 0,
      dy: 0,
      ...override,
    };
    const extra: Scope = {
      __event: payload,
      [node.name]: node.item,
    };
    if (isRecord(node.item)) {
      for (const [key, value] of Object.entries(node.item)) extra[key] = value;
    }

    for (const handler of this.ir.events) {
      if (handler.type !== type) continue;
      if (handler.target !== node.name && handler.target !== node.group) continue;
      execute(handler.body, this.scopes(extra));
    }
    this.applyBinds();
    this.applyRules();
    this.render();
  }

  private sceneScale(): number {
    return sceneScaleOf(evalSceneProps(this.ir.scene.props, this.scopes()));
  }

  private sceneAnchorOf(node: RenderNode): { x: number; y: number } {
    const css = this.anchorOf(node);
    return viewBoxToScene(css.x, css.y, this.sceneScale());
  }

  private pointerToScene(event: PointerEvent): PointerScene {
    const svg = this.svg!;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    let localX: number;
    let localY: number;
    let t: number;
    if (ctm) {
      const local = pt.matrixTransform(ctm.inverse());
      const vb = svg.viewBox.baseVal;
      localX = local.x;
      localY = local.y;
      t = Math.min(1, Math.max(0, local.x / Math.max(vb.width || 1, 1)));
    } else {
      // Fallback if CTM unavailable (rare headless edge case).
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      const vbW = vb.width || 1;
      const vbH = vb.height || 1;
      localX = ((event.clientX - rect.left) / width) * vbW;
      localY = ((event.clientY - rect.top) / height) * vbH;
      t = Math.min(1, Math.max(0, (event.clientX - rect.left) / width));
    }
    const scene = viewBoxToScene(localX, localY, this.sceneScale());
    return { x: scene.x, y: scene.y, t, px: localX, py: localY };
  }

  private targetOf(event: PointerEvent): RenderNode | null {
    const el = (event.target as Element | null)?.closest("[data-viva-id]");
    if (!el) return null;
    const id = el.getAttribute("data-viva-id");
    return this.lastNodes.find((node) => node.id === id) ?? this.flatten().find((node) => node.id === id) ?? null;
  }

  private refreshNode(id: string): RenderNode | null {
    return this.flatten().find((node) => node.id === id) ?? null;
  }

  private hasHandler(type: string, node: RenderNode): boolean {
    return this.ir.events.some(
      (handler) =>
        handler.type === type && (handler.target === node.name || handler.target === node.group),
    );
  }

  private isDraggable(node: RenderNode): boolean {
    return Boolean(node.props.drag ?? node.props.draggable);
  }

  private isSolid(node: RenderNode): boolean {
    return Boolean(node.props.solid ?? node.props.collide ?? this.hasHandler("collide", node));
  }

  private anchorOf(node: RenderNode): { x: number; y: number } {
    return { x: num(node.props.x, 0), y: num(node.props.y, 0) };
  }

  private shapeOf(node: RenderNode): HitShape {
    const p = node.props;
    if (p.w !== undefined || p.width !== undefined || p.h !== undefined || p.height !== undefined) {
      return {
        kind: "rect",
        x: num(p.x, 0),
        y: num(p.y, 0),
        w: num(p.w ?? p.width, 80),
        h: num(p.h ?? p.height, 24),
      };
    }
    return {
      kind: "circle",
      x: num(p.x, 0),
      y: num(p.y, 0),
      r: num(p.r ?? p.size, 16),
    };
  }

  private applyEnterAnimations(): void {
    if (!this.svg) return;
    for (const anim of this.ir.animates) {
      const target = str(anim.props.target, "");
      const prop = str(anim.props.prop ?? anim.props.property, "opacity");
      const from = num(anim.props.from, 0);
      const to = num(anim.props.to, 1);
      const duration = num(anim.props.duration, 800);
      const nodes = target
        ? Array.from(this.svg.querySelectorAll(`[data-viva-name="${css(target)}"]`))
        : Array.from(this.svg.children);
      for (const node of nodes) {
        (node as SVGElement).style.transition = `${prop} ${duration}ms ease`;
        node.setAttribute(prop, String(from));
        requestAnimationFrame(() => node.setAttribute(prop, String(to)));
      }
    }
  }
}

function overlaps(a: HitShape, b: HitShape): boolean {
  if (a.kind === "circle" && b.kind === "circle") {
    return Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r;
  }
  const ar = a.kind === "rect" ? a : circleToRect(a);
  const br = b.kind === "rect" ? b : circleToRect(b);
  return ar.x < br.x + br.w && ar.x + ar.w > br.x && ar.y < br.y + br.h && ar.y + ar.h > br.y;
}

function circleToRect(c: Extract<HitShape, { kind: "circle" }>): Extract<HitShape, { kind: "rect" }> {
  return { kind: "rect", x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
}

function evalProps(props: Record<string, Expr>, scopes: Scope[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(props)) {
    if (STYLE_META_PROPS.has(key)) continue;
    out[key] = evaluate(expr, scopes);
  }
  return out;
}

function inferTag(props: Record<string, unknown>): string {
  if (props.d || props.path) return "path";
  if (props.x1 !== undefined || props.x2 !== undefined) return "line";
  if (props.text !== undefined || props.label !== undefined || props.font !== undefined) {
    return "text";
  }
  if (props.w !== undefined || props.width !== undefined || props.h !== undefined) {
    return "rect";
  }
  return "circle";
}

function asPair(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    return [num(value[0], fallback[0]), num(value[1], fallback[1])];
  }
  return fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return value === undefined || value === null ? fallback : String(value);
}

function css(value: string): string {
  return value.replace(/"/g, '\\"');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearRecord(target: Record<string, unknown>): void {
  for (const key of Object.keys(target)) delete target[key];
}

function setDeep(root: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = cur[key];
    if (!isRecord(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

function renderNodeToSelected(node: RenderNode): {
  id: string;
  name: string;
  group?: string;
  layerId: string;
  layerName: string;
  bbox: { x: number; y: number; w: number; h: number };
} {
  return {
    id: node.id,
    name: node.name,
    group: node.group,
    layerId: node.layerId,
    layerName: node.layerName,
    bbox: propsToBBox(node.props),
  };
}

function propsToBBox(p: Record<string, unknown>): { x: number; y: number; w: number; h: number } {
  return nodePropsToBBox(p);
}


