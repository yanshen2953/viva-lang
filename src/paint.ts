/**
 * SVG paint helpers: gradients, glow/shadow/blur filters, dashes, transforms.
 * Keeps the DSL surface tiny — richness lives in runtime attribute mapping.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export function ensureDefs(svg: SVGSVGElement): SVGDefsElement {
  let defs = svg.querySelector(":scope > defs") as SVGDefsElement | null;
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }
  return defs;
}

export function cssId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function asColors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item && item !== "none");
  }
  if (typeof value === "string" && value.trim() && value.trim() !== "none") return [value.trim()];
  return [];
}

/** Shared by Runtime and static SVG so a colorbar ramp is the same linearGradient. */
export function gradientSpec(
  props: Record<string, unknown>,
): { colors: string[]; vertical: boolean } | null {
  const colors = asColors(props.gradient ?? props.fillGradient ?? props.ramp);
  if (colors.length < 2) return null;
  const vertical = str(props.gradientDir ?? props.gradientAxis, "y") !== "x";
  return { colors, vertical };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return value === undefined || value === null ? fallback : String(value);
}

/** Resolve fill to a solid color or url(#gradient). */
export function resolveFill(
  defs: SVGDefsElement,
  nodeId: string,
  props: Record<string, unknown>,
  hovered: boolean,
  defaultFill = "#38bdf8",
): string {
  if (hovered && props.hoverFill !== undefined) return String(props.hoverFill);

  const spec = gradientSpec(props);
  if (spec) {
    const id = `grad_${cssId(nodeId)}`;
    let grad = defs.querySelector(`#${id}`) as SVGLinearGradientElement | null;
    if (!grad) {
      grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.id = id;
      defs.appendChild(grad);
    }
    const { colors, vertical } = spec;
    grad.setAttribute("x1", "0%");
    grad.setAttribute("y1", "0%");
    grad.setAttribute("x2", vertical ? "0%" : "100%");
    grad.setAttribute("y2", vertical ? "100%" : "0%");
    grad.innerHTML = "";
    colors.forEach((color, index) => {
      const stop = document.createElementNS(SVG_NS, "stop");
      const offset = colors.length === 1 ? 0 : index / (colors.length - 1);
      stop.setAttribute("offset", `${offset * 100}%`);
      stop.setAttribute("stop-color", color);
      const stopOpacity = props.gradientOpacity;
      if (stopOpacity !== undefined) stop.setAttribute("stop-opacity", String(stopOpacity));
      grad!.appendChild(stop);
    });
    return `url(#${id})`;
  }

  return str(props.fill ?? props.color, defaultFill);
}

function upsertFilter(defs: SVGDefsElement, id: string): SVGFilterElement {
  let filter = defs.querySelector(`#${id}`) as SVGFilterElement | null;
  if (!filter) {
    filter = document.createElementNS(SVG_NS, "filter");
    filter.id = id;
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    defs.appendChild(filter);
  }
  filter.innerHTML = "";
  return filter;
}

/** Build combined filter chain: blur + glow + drop-shadow. */
export function resolveFilter(
  defs: SVGDefsElement,
  nodeId: string,
  props: Record<string, unknown>,
): string | null {
  const blur = num(props.blur, 0);
  const glow = num(props.glow, 0);
  const glowColor = str(props.glowColor, str(props.fill ?? props.color, "#38bdf8"));
  const shadow = props.shadow;
  const hasShadow =
    shadow !== undefined && shadow !== false && shadow !== null && shadow !== 0;

  if (blur <= 0 && glow <= 0 && !hasShadow) return null;

  const id = `flt_${cssId(nodeId)}`;
  const filter = upsertFilter(defs, id);

  if (blur > 0) {
    const gBlur = document.createElementNS(SVG_NS, "feGaussianBlur");
    gBlur.setAttribute("in", "SourceGraphic");
    gBlur.setAttribute("stdDeviation", String(blur));
    gBlur.setAttribute("result", "blurred");
    filter.appendChild(gBlur);
  }

  if (glow > 0) {
    const gBlur = document.createElementNS(SVG_NS, "feGaussianBlur");
    gBlur.setAttribute("in", "SourceAlpha");
    gBlur.setAttribute("stdDeviation", String(glow / 3));
    gBlur.setAttribute("result", "glowBlur");
    filter.appendChild(gBlur);

    const flood = document.createElementNS(SVG_NS, "feFlood");
    flood.setAttribute("flood-color", glowColor);
    flood.setAttribute("flood-opacity", str(props.glowOpacity, "0.85"));
    flood.setAttribute("result", "glowColor");
    filter.appendChild(flood);

    const composite = document.createElementNS(SVG_NS, "feComposite");
    composite.setAttribute("in", "glowColor");
    composite.setAttribute("in2", "glowBlur");
    composite.setAttribute("operator", "in");
    composite.setAttribute("result", "glow");
    filter.appendChild(composite);
  }

  if (hasShadow) {
    let dx = 0;
    let dy = 10;
    let std = 16;
    if (typeof shadow === "number") {
      dy = shadow;
      std = Math.max(4, shadow);
    } else if (Array.isArray(shadow)) {
      dx = num(shadow[0], 0);
      dy = num(shadow[1], 10);
      std = num(shadow[2], 16);
    }
    const shadowColor = str(props.shadowColor, "#000000");
    const flood = document.createElementNS(SVG_NS, "feFlood");
    flood.setAttribute("flood-color", shadowColor);
    flood.setAttribute("flood-opacity", str(props.shadowOpacity, "0.45"));
    flood.setAttribute("result", "shadowFlood");
    filter.appendChild(flood);

    const blurEl = document.createElementNS(SVG_NS, "feGaussianBlur");
    blurEl.setAttribute("in", "SourceAlpha");
    blurEl.setAttribute("stdDeviation", String(std / 3));
    blurEl.setAttribute("result", "shadowBlur");
    filter.appendChild(blurEl);

    const composite = document.createElementNS(SVG_NS, "feComposite");
    composite.setAttribute("in", "shadowFlood");
    composite.setAttribute("in2", "shadowBlur");
    composite.setAttribute("operator", "in");
    composite.setAttribute("result", "shadowSoft");
    filter.appendChild(composite);

    const offset = document.createElementNS(SVG_NS, "feOffset");
    offset.setAttribute("in", "shadowSoft");
    offset.setAttribute("dx", String(dx));
    offset.setAttribute("dy", String(dy));
    offset.setAttribute("result", "shadow");
    filter.appendChild(offset);
  }

  const merge = document.createElementNS(SVG_NS, "feMerge");
  if (hasShadow) {
    const m1 = document.createElementNS(SVG_NS, "feMergeNode");
    m1.setAttribute("in", "shadow");
    merge.appendChild(m1);
  }
  if (glow > 0) {
    const m2 = document.createElementNS(SVG_NS, "feMergeNode");
    m2.setAttribute("in", "glow");
    merge.appendChild(m2);
  }
  const m3 = document.createElementNS(SVG_NS, "feMergeNode");
  m3.setAttribute("in", blur > 0 ? "blurred" : "SourceGraphic");
  merge.appendChild(m3);
  filter.appendChild(merge);

  return `url(#${id})`;
}

export function applyBlend(el: SVGElement | HTMLElement, props: Record<string, unknown>): void {
  const blend = props.blend ?? props.blendMode;
  if (blend === undefined || blend === null || blend === false) {
    el.style.mixBlendMode = "";
    return;
  }
  el.style.mixBlendMode = String(blend);
}

export function applyDash(el: SVGElement, props: Record<string, unknown>): void {
  const dash = props.dash ?? props.strokeDash ?? props.strokeDasharray;
  if (dash === undefined || dash === null || dash === false) {
    el.removeAttribute("stroke-dasharray");
    return;
  }
  if (Array.isArray(dash)) {
    el.setAttribute("stroke-dasharray", dash.map(String).join(" "));
  } else {
    el.setAttribute("stroke-dasharray", String(dash));
  }
}

export function applyTransform(
  el: SVGElement,
  props: Record<string, unknown>,
  anchor: { x: number; y: number },
): void {
  const rotate = num(props.rotate ?? props.rotation, 0);
  const scale = props.scale;
  let sx = 1;
  let sy = 1;
  if (typeof scale === "number") {
    sx = sy = scale;
  } else if (Array.isArray(scale)) {
    sx = num(scale[0], 1);
    sy = num(scale[1], sx);
  }
  if (!rotate && sx === 1 && sy === 1) {
    el.removeAttribute("transform");
    return;
  }
  el.setAttribute(
    "transform",
    `translate(${anchor.x} ${anchor.y}) rotate(${rotate}) scale(${sx} ${sy}) translate(${-anchor.x} ${-anchor.y})`,
  );
}

export function applyTypography(el: SVGTextElement, props: Record<string, unknown>): void {
  el.setAttribute("font-size", String(num(props.font ?? props.fontSize, 16)));
  el.setAttribute("font-family", str(props.fontFamily, "IBM Plex Sans, sans-serif"));
  if (props.fontWeight !== undefined) el.setAttribute("font-weight", String(props.fontWeight));
  else el.removeAttribute("font-weight");
  if (props.fontStyle !== undefined) el.setAttribute("font-style", String(props.fontStyle));
  else el.removeAttribute("font-style");
  if (props.letterSpacing !== undefined) {
    el.setAttribute("letter-spacing", String(props.letterSpacing));
  } else {
    el.removeAttribute("letter-spacing");
  }
  const align = str(props.align, "start");
  el.setAttribute(
    "text-anchor",
    align === "center" ? "middle" : align === "right" ? "end" : "start",
  );
  if (props.baseline !== undefined) {
    el.setAttribute("dominant-baseline", String(props.baseline));
  }

  const raw = props.text ?? props.label;
  el.textContent = "";
  if (Array.isArray(raw)) {
    const lineHeight = num(props.lineHeight, 1.25);
    const fontSize = num(props.font ?? props.fontSize, 16);
    raw.forEach((line, index) => {
      const tspan = document.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", el.getAttribute("x") || "0");
      tspan.setAttribute("dy", index === 0 ? "0" : String(fontSize * lineHeight));
      tspan.textContent = String(line);
      el.appendChild(tspan);
    });
  } else {
    const text = String(raw ?? "");
    if (text.includes("\n")) {
      const lines = text.split("\n");
      const lineHeight = num(props.lineHeight, 1.25);
      const fontSize = num(props.font ?? props.fontSize, 16);
      lines.forEach((line, index) => {
        const tspan = document.createElementNS(SVG_NS, "tspan");
        tspan.setAttribute("x", el.getAttribute("x") || "0");
        tspan.setAttribute("dy", index === 0 ? "0" : String(fontSize * lineHeight));
        tspan.textContent = line;
        el.appendChild(tspan);
      });
    } else {
      el.textContent = text;
    }
  }
}
