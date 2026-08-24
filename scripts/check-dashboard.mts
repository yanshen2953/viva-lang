import { readFileSync } from "node:fs";
import { compileSource } from "../src/pipeline.ts";

const src = readFileSync("examples/dashboard.viva", "utf8");
const r = compileSource(src, "dashboard.viva");
if (!r.ir) {
  console.error("FAIL", r.error);
  process.exit(1);
}
console.log("OK name=", r.ir.name);
console.log(
  "layers=",
  r.ir.scene.layers.map((l) => l.name).join(","),
);
console.log(
  "events=",
  r.ir.events.length,
  r.ir.events.map((e) => `${e.type}:${e.target}`).join(" | "),
);
console.log(
  "rules=",
  r.ir.rules.length,
  "ticks=",
  r.ir.ticks.length,
  "animates=",
  r.ir.animates.length,
);
console.log("state keys=", Object.keys(r.ir.state).join(","));
console.log(
  "metrics=",
  (r.ir.data.metrics as unknown[]).length,
  "trend=",
  (r.ir.data.trend as unknown[]).length,
);
