import { compileSource } from "../src/pipeline";
import { Runtime } from "../src/runtime";
import cells from "../examples/cells.viva?raw";
import cities from "../examples/cities.viva?raw";
import dashboard from "../examples/dashboard.viva?raw";
import hello from "../examples/hello.viva?raw";
import paper from "../examples/paper.viva?raw";
import twin from "../examples/twin.viva?raw";
import "./style.css";

const examples: Record<string, string> = {
  Hello: hello,
  Cities: cities,
  Cells: cells,
  Paper: paper,
  Twin: twin,
  Dashboard: dashboard,
};

const sourceEl = document.querySelector("#source") as HTMLTextAreaElement;
const stageEl = document.querySelector("#stage") as HTMLElement;
const errorEl = document.querySelector("#error") as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const navEl = document.querySelector("#examples") as HTMLElement;
const runEl = document.querySelector("#run") as HTMLButtonElement;

let runtime: Runtime | null = null;
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
  for (const button of navEl.querySelectorAll("button")) {
    button.classList.toggle("active", button.textContent === name);
  }
  run();
}

function run(): void {
  const started = performance.now();
  const result = compileSource(sourceEl.value, `${current}.viva`);
  runtime?.stop();
  stageEl.innerHTML = "";

  if (!result.ir) {
    errorEl.hidden = false;
    errorEl.textContent = result.error ?? "compile failed";
    statusEl.textContent = "编译失败";
    statusEl.style.color = "#fca5a5";
    return;
  }

  errorEl.hidden = true;
  runtime = new Runtime({ mount: stageEl, ir: result.ir });
  runtime.start();
  const ms = Math.round(performance.now() - started);
  statusEl.textContent = `${result.ir.name} · ${ms}ms`;
  statusEl.style.color = "#34d399";
}

load("Hello");
