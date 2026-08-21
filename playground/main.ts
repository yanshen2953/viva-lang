import { createVivaAgentHost, promptServiceWithHandbooks } from "../src/agent";
import type { VivaSession } from "../src/agent";
import arena from "../examples/arena.viva?raw";
import atelier from "../examples/atelier.viva?raw";
import cells from "../examples/cells.viva?raw";
import charts from "../examples/charts.viva?raw";
import cities from "../examples/cities.viva?raw";
import dashboard from "../examples/dashboard.viva?raw";
import hello from "../examples/hello.viva?raw";
import paper from "../examples/paper.viva?raw";
import scatter from "../examples/scatter.viva?raw";
import twin from "../examples/twin.viva?raw";
import printNature from "../docs/handbooks/print-nature.md?raw";
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
};

const sourceEl = document.querySelector("#source") as HTMLTextAreaElement;
const stageEl = document.querySelector("#stage") as HTMLElement;
const errorEl = document.querySelector("#error") as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const navEl = document.querySelector("#examples") as HTMLElement;
const runEl = document.querySelector("#run") as HTMLButtonElement;

const host = createVivaAgentHost({
  prompt: promptServiceWithHandbooks({
    "print-nature": printNature,
  }),
});

let session: VivaSession = host.createSession({
  mount: stageEl,
  statePolicy: "preserve-data",
  handbooks: [],
});

let timer: number | null = null;
let current = "Hello";

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

function load(name: string): void {
  current = name;
  sourceEl.value = examples[name] ?? "";
  for (const button of Array.from(navEl.querySelectorAll("button"))) {
    button.classList.toggle("active", button.textContent === name);
  }
  run();
}

function run(): void {
  const started = performance.now();
  const result = session.patch(sourceEl.value, { reason: "user-edit" });

  if (!result.ok) {
    errorEl.hidden = false;
    errorEl.textContent = result.error ?? "compile failed";
    statusEl.textContent = "编译失败";
    statusEl.style.color = "#fca5a5";
    return;
  }

  errorEl.hidden = true;
  const ms = Math.round(performance.now() - started);
  const irName = result.ir?.name ?? current;
  statusEl.textContent = `${irName} · ${ms}ms · ${session.id}`;
  statusEl.style.color = "#34d399";
}

load("Hello");
