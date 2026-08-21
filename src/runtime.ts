import type { Expr } from "./ast.js";
import { cloneValue, evaluate, execute, truthy, type Scope } from "./eval.js";
import type { SceneNodeIR, VisualIR } from "./ir.js";

export type RuntimeOptions = {
  mount: HTMLElement;
  ir: VisualIR;
};

type RenderNode = {
  id: string;
  name: string;
  group?: string;
  props: Record<string, unknown>;
  item?: unknown;
};

export class Runtime {
  private readonly ir: VisualIR;
  private readonly mount: HTMLElement;
  private readonly state: Record<string, unknown>;
  private readonly data: Record<string, unknown>;
  private svg: SVGSVGElement | null = null;
  private animFrame = 0;
  private lastTick = 0;
  private running = false;
  private hoverId: string | null = null;
  private time = 0;

  constructor(options: RuntimeOptions) {
    this.ir = options.ir;
    this.mount = options.mount;
    this.state = cloneValue(options.ir.state);
    this.data = cloneValue(options.ir.data);
  }

  start(): void {
    this.stop();
    this.mount.innerHTML = "";
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "viva-scene");
    this.applySceneBox();
    this.mount.appendChild(this.svg);
    this.bindPointer();
    this.applyBinds();
    this.applyRules();
    this.render();
    this.applyEnterAnimations();
    this.running = true;
    this.lastTick = performance.now();
    this.loop(this.lastTick);
  }

  stop(): void {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = 0;
  }

  getWorld(): { state: Record<string, unknown>; data: Record<string, unknown> } {
    return { state: this.state, data: this.data };
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.time = now;
    for (const tick of this.ir.ticks) {
      const interval = 1000 / Math.max(tick.fps, 1);
      if (now - this.lastTick >= interval) {
        execute(tick.body, this.scopes());
        this.lastTick = now;
      }
    }
    this.applyBinds();
    this.applyRules();
    this.render();
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
    const props = evalProps(this.ir.scene.props, this.scopes());
    const size = asPair(props.size, [880, 480]);
    const width = num(props.width, size[0]);
    const height = num(props.height, size[1]);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");
    this.svg.style.background = str(props.background, "#0b1220");
  }

  private flatten(): RenderNode[] {
    const nodes: RenderNode[] = [];
    for (const layer of this.ir.scene.layers) {
      this.flattenItems(layer.items, this.scopes(), nodes, layer.name);
    }
    return nodes;
  }

  private flattenItems(
    items: SceneNodeIR[],
    scopes: Scope[],
    out: RenderNode[],
    prefix: string,
  ): void {
    for (const item of items) {
      if (item.kind === "node") {
        out.push({
          id: `${prefix}:${item.id}`,
          name: item.name,
          group: item.group,
          props: evalProps(item.props, scopes),
          item: scopes[0]?.[Object.keys(scopes[0] ?? {})[0] ?? ""] ?? null,
        });
        continue;
      }
      if (item.kind === "if") {
        if (truthy(evaluate(item.cond, scopes))) {
          this.flattenItems(item.body, scopes, out, `${prefix}:${item.id}`);
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
        );
      });
    }
  }

  private render(): void {
    if (!this.svg) return;
    this.applySceneBox();
    const nodes = this.flatten();
    const used = new Set<string>();

    for (const node of nodes) {
      used.add(node.id);
      let el = this.svg.querySelector(`[data-viva-id="${css(node.id)}"]`) as SVGElement | null;
      if (!el) {
        el = this.createElement(node);
        this.svg.appendChild(el);
      }
      this.updateElement(el, node);
    }

    for (const child of Array.from(this.svg.children)) {
      const id = child.getAttribute("data-viva-id");
      if (id && !used.has(id) && child.tagName.toLowerCase() !== "style") {
        child.remove();
      }
    }
  }

  private createElement(node: RenderNode): SVGElement {
    const tag = inferTag(node.props);
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    el.setAttribute("data-viva-id", node.id);
    el.setAttribute("data-viva-name", node.name);
    if (node.group) el.setAttribute("data-viva-group", node.group);
    el.style.cursor = "pointer";
    return el;
  }

  private updateElement(el: SVGElement, node: RenderNode): void {
    const p = node.props;
    const x = num(p.x, 0);
    const y = num(p.y, 0);
    const opacity = p.opacity === undefined ? 1 : num(p.opacity, 1);
    const visible = p.visible === undefined ? true : Boolean(p.visible);
    el.style.display = visible ? "" : "none";
    el.setAttribute("opacity", String(opacity));
    el.setAttribute("data-viva-name", node.name);
    if (node.group) el.setAttribute("data-viva-group", node.group);

    if (el.tagName === "circle") {
      el.setAttribute("cx", String(x));
      el.setAttribute("cy", String(y));
      el.setAttribute("r", String(num(p.r ?? p.size, 16)));
      el.setAttribute("fill", str(p.fill ?? p.color, "#38bdf8"));
      if (p.stroke) el.setAttribute("stroke", String(p.stroke));
      if (p.strokeWidth) el.setAttribute("stroke-width", String(p.strokeWidth));
    } else if (el.tagName === "rect") {
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("width", String(num(p.w ?? p.width, 80)));
      el.setAttribute("height", String(num(p.h ?? p.height, 24)));
      el.setAttribute("rx", String(num(p.radius, 0)));
      el.setAttribute("fill", str(p.fill ?? p.color, "#1e293b"));
      if (p.stroke) el.setAttribute("stroke", String(p.stroke));
    } else if (el.tagName === "text") {
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("fill", str(p.fill ?? p.color, "#e2e8f0"));
      el.setAttribute("font-size", String(num(p.font ?? p.fontSize, 16)));
      el.setAttribute("font-family", str(p.fontFamily, "IBM Plex Sans, sans-serif"));
      const align = str(p.align, "start");
      el.setAttribute(
        "text-anchor",
        align === "center" ? "middle" : align === "right" ? "end" : "start",
      );
      el.textContent = String(p.text ?? p.label ?? node.name);
    } else if (el.tagName === "line") {
      el.setAttribute("x1", String(num(p.x1, x)));
      el.setAttribute("y1", String(num(p.y1, y)));
      el.setAttribute("x2", String(num(p.x2, x + 40)));
      el.setAttribute("y2", String(num(p.y2, y)));
      el.setAttribute("stroke", str(p.stroke ?? p.fill, "#64748b"));
      el.setAttribute("stroke-width", String(num(p.strokeWidth, 2)));
    } else if (el.tagName === "path") {
      el.setAttribute("d", str(p.d ?? p.path, ""));
      el.setAttribute("fill", str(p.fill, "none"));
      el.setAttribute("stroke", str(p.stroke, "#94a3b8"));
    }

    if (this.hoverId === node.id && p.hoverFill) {
      el.setAttribute("fill", String(p.hoverFill));
    }
  }

  private bindPointer(): void {
    if (!this.svg) return;
    this.svg.addEventListener("pointermove", (event) => {
      const target = this.targetOf(event);
      this.hoverId = target?.id ?? null;
      if (target) this.fire("hover", target, event);
    });
    this.svg.addEventListener("pointerdown", (event) => {
      const target = this.targetOf(event);
      if (target) this.fire("click", target, event);
    });
  }

  private targetOf(event: PointerEvent): RenderNode | null {
    const el = (event.target as Element | null)?.closest("[data-viva-id]");
    if (!el) return null;
    const id = el.getAttribute("data-viva-id");
    return this.flatten().find((node) => node.id === id) ?? null;
  }

  private fire(type: string, node: RenderNode, event: PointerEvent): void {
    const box = this.svg?.viewBox.baseVal;
    const t = box && box.width ? (event.offsetX / (this.svg?.clientWidth || 1)) : 0;
    const extra: Scope = {
      __event: {
        x: event.offsetX,
        y: event.offsetY,
        t: Math.min(1, Math.max(0, t)),
      },
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

function evalProps(props: Record<string, Expr>, scopes: Scope[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(props)) {
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
