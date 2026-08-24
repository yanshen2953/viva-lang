import { createVivaAgentHost, promptServiceWithHandbooks } from "../src/agent";
import type { VivaSession } from "../src/agent";
import type { Diagnostic } from "../src/diagnostics";
import type { FeedbackKind, SelectionCombine, SelectionTool } from "../src/review";
import arena from "../examples/arena.viva?raw";
import atelier from "../examples/atelier.viva?raw";
import cells from "../examples/cells.viva?raw";
import charts from "../examples/charts.viva?raw";
import cities from "../examples/cities.viva?raw";
import dashboard from "../examples/dashboard.viva?raw";
import hello from "../examples/hello.viva?raw";
import paper from "../examples/paper.viva?raw";
import scatter from "../examples/scatter.viva?raw";
import figureAtlas from "../examples/figure-atlas.viva?raw";
import scienceStudio from "../examples/science-studio.viva?raw";
import twin from "../examples/twin.viva?raw";
import printNature from "../docs/handbooks/print-nature.md?raw";
import dashboardHandbook from "../docs/handbooks/dashboard.md?raw";
import "./style.css";

const examples: Record<string, string> = {
  Hello: hello,
  Scatter: scatter,
  Charts: charts,
  Cities: cities,
  Cells: cells,
  Paper: paper,
  Twin: twin,
  Dashboard: dashboard,
  Arena: arena,
  Atelier: atelier,
  Studio: scienceStudio,
  Atlas: figureAtlas,
};

/** Suggested handbook when opening an example (default preset: print-nature). */
const handbookSuggestions: Record<string, string> = {
  Atlas: "print-nature",
  Studio: "print-nature",
  Paper: "print-nature",
};

const DEFAULT_HANDBOOK = "print-nature";

const sourceEl = document.querySelector("#source") as HTMLTextAreaElement;
const stageEl = document.querySelector("#stage") as HTMLElement;
const errorEl = document.querySelector("#error") as HTMLElement;
const checkOutEl = document.querySelector("#check-out") as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const navEl = document.querySelector("#examples") as HTMLElement;
const runEl = document.querySelector("#run") as HTMLButtonElement;
const handbookSelect = document.querySelector("#handbook-select") as HTMLSelectElement;
const reviewToggle = document.querySelector("#review-toggle") as HTMLButtonElement;
const reviewBar = document.querySelector("#review-bar") as HTMLElement;
const reviewOut = document.querySelector("#review-out") as HTMLElement;
const feedbackKind = document.querySelector("#feedback-kind") as HTMLSelectElement;
const feedbackText = document.querySelector("#feedback-text") as HTMLInputElement;

const host = createVivaAgentHost({
  prompt: promptServiceWithHandbooks({
    "print-nature": printNature,
    dashboard: dashboardHandbook,
  }),
});

let session: VivaSession = host.createSession({
  mount: stageEl,
  statePolicy: "preserve-data",
  handbooks: [],
});

let timer: number | null = null;
let current = "Hello";
let reviewOn = false;
let stickyTool: SelectionTool = "rect";
let stickyCombine: SelectionCombine = "replace";

function activeHandbooks(): string[] {
  const id = handbookSelect.value.trim();
  return id ? [id] : [];
}

function handbookStatusLabel(): string {
  const ids = activeHandbooks();
  return ids.length ? `hb:${ids.join("+")}` : "hb:—";
}

function syncReviewChrome(ctrl: NonNullable<ReturnType<VivaSession["getReview"]>>): void {
  ctrl.setTool(stickyTool);
  ctrl.setCombine(stickyCombine);
  reviewBar.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === stickyTool);
  });
  reviewBar.querySelectorAll<HTMLButtonElement>("[data-combine]").forEach((b) => {
    b.classList.toggle("active", b.dataset.combine === stickyCombine);
  });
}

function ensureReviewAttached() {
  const ctrl = session.createReview({ attach: true });
  if (ctrl) syncReviewChrome(ctrl);
  return ctrl;
}

for (const name of Object.keys(examples)) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  button.addEventListener("click", () => load(name));
  navEl.appendChild(button);
}

sourceEl.addEventListener("input", () => {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(run, 280);
});
runEl.addEventListener("click", run);
handbookSelect.addEventListener("change", run);

reviewToggle.addEventListener("click", () => {
  reviewOn = !reviewOn;
  reviewBar.hidden = !reviewOn;
  reviewToggle.classList.toggle("active", reviewOn);
  if (reviewOn) {
    const ctrl = ensureReviewAttached();
    if (!ctrl) {
      statusEl.textContent = "审查模式需要已编译场景";
      return;
    }
    statusEl.textContent = "审查模式：框选 / 点选 / 套索 / 曲线 → 标注 → Brief";
    statusEl.style.color = "#38bdf8";
    showBrief();
  } else {
    session.getReview()?.detach();
    reviewOut.hidden = true;
    statusEl.textContent = "已退出审查模式";
    statusEl.style.color = "#93a4bb";
  }
});

reviewBar.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    stickyTool = btn.dataset.tool as SelectionTool;
    ensureReviewAttached()?.setTool(stickyTool);
    reviewBar.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

reviewBar.querySelectorAll<HTMLButtonElement>("[data-combine]").forEach((btn) => {
  btn.addEventListener("click", () => {
    stickyCombine = btn.dataset.combine as SelectionCombine;
    ensureReviewAttached()?.setCombine(stickyCombine);
    reviewBar.querySelectorAll("[data-combine]").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

document.querySelector("#review-invert")?.addEventListener("click", () => {
  ensureReviewAttached()?.invertSelection();
  showBrief();
});
document.querySelector("#review-all")?.addEventListener("click", () => {
  const ctrl = ensureReviewAttached();
  if (!ctrl) return;
  stickyCombine = "replace";
  syncReviewChrome(ctrl);
  ctrl.selectByRegion({ kind: "rect", x: -1e6, y: -1e6, w: 2e6, h: 2e6 }, "replace");
  showBrief();
});
document.querySelector("#review-clear")?.addEventListener("click", () => {
  const ctrl = session.getReview();
  ctrl?.clearSelection();
  ctrl?.clearFeedback();
  showBrief();
});
document.querySelector("#feedback-add")?.addEventListener("click", () => {
  const text = feedbackText.value.trim();
  if (!text) return;
  ensureReviewAttached()?.addFeedback({
    kind: feedbackKind.value as FeedbackKind,
    text,
  });
  feedbackText.value = "";
  showBrief();
});
document.querySelector("#review-brief")?.addEventListener("click", async () => {
  const brief = session.getReview()?.snapshot().agentBrief ?? "";
  await navigator.clipboard.writeText(brief);
  statusEl.textContent = "已复制 agentBrief";
  statusEl.style.color = "#34d399";
  showBrief();
});
document.querySelector("#review-export-svg")?.addEventListener("click", () => {
  const snap = session.getReview()?.snapshot();
  const svg = snap?.selectionSvg || session.exportSvg();
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "viva-selection.svg";
  a.click();
});

session.on("user-interact", () => {
  if (reviewOn) showBrief();
});

function showBrief(): void {
  const snap = session.getReview()?.snapshot();
  if (!snap) {
    reviewOut.hidden = true;
    return;
  }
  reviewOut.hidden = false;
  reviewOut.textContent = `${snap.agentBrief}\n\n--- ids ---\n${snap.payload.ids.join(", ") || "(none)"}`;
}

function load(name: string): void {
  current = name;
  sourceEl.value = examples[name] ?? "";
  const suggested = handbookSuggestions[name] ?? DEFAULT_HANDBOOK;
  handbookSelect.value = suggested;
  for (const button of Array.from(navEl.querySelectorAll("button"))) {
    button.classList.toggle("active", button.textContent === name);
  }
  run();
}

function formatCheckLine(d: Diagnostic): string {
  const sev = (d as { severity?: string }).severity;
  const layer = (d as { layer?: string }).layer;
  const tag = sev === "error" ? "ERR" : "warn";
  const layerTag = layer === "visual" ? "visual" : "struct";
  return `[${tag}/${layerTag}] ${d.code ?? "check"}: ${d.message}`;
}

function showStructuralChecks(diagnostics: Diagnostic[]): void {
  const checks = diagnostics.filter((d) => d.code?.startsWith("check."));
  if (!checks.length) {
    checkOutEl.hidden = true;
    checkOutEl.classList.remove("ok");
    return;
  }
  checkOutEl.hidden = false;
  const hasError = checks.some((d) => (d as { severity?: string }).severity === "error");
  checkOutEl.classList.toggle("ok", !hasError);
  checkOutEl.textContent = checks.map(formatCheckLine).join("\n");
}

function run(): void {
  const started = performance.now();
  const handbooks = activeHandbooks();
  const result = session.patch(sourceEl.value, {
    reason: "user-edit",
    handbooks,
  });

  if (!result.ok) {
    errorEl.hidden = false;
    errorEl.textContent = result.error ?? "compile failed";
    checkOutEl.hidden = true;
    statusEl.textContent = "编译失败";
    statusEl.style.color = "#fca5a5";
    return;
  }

  errorEl.hidden = true;
  showStructuralChecks(result.diagnostics);
  const ms = Math.round(performance.now() - started);
  const irName = result.ir?.name ?? current;
  const hb = handbookStatusLabel();
  const checkTag =
    result.diagnostics.filter((d) => d.code?.startsWith("check.")).length === 0
      ? "check:ok"
      : result.diagnostics.some(
          (d) => d.code?.startsWith("check.") && (d as { severity?: string }).severity === "error",
        )
        ? "check:err"
        : `check:${result.diagnostics.filter((d) => d.code?.startsWith("check.")).length}`;
  if (reviewOn) {
    ensureReviewAttached();
    showBrief();
    statusEl.textContent = `${irName} · ${ms}ms · ${hb} · ${checkTag} · 审查中`;
    statusEl.style.color = "#38bdf8";
  } else {
    statusEl.textContent = `${irName} · ${ms}ms · ${hb} · ${checkTag}`;
    statusEl.style.color = "#34d399";
  }
}

load("Atlas");
