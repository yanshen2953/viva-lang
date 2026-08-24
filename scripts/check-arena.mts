import { readFileSync } from "node:fs";
import { compileSource } from "../src/pipeline.ts";

const src = readFileSync("examples/arena.viva", "utf8");
const r = compileSource(src, "arena.viva");
if (!r.ir) {
  console.error("FAIL", r.error);
  process.exit(1);
}
console.log("OK", r.ir.name);
console.log(
  "layers",
  r.ir.scene.layers.map((l) => l.name).join(","),
);
console.log(
  "events",
  r.ir.events.map((e) => `${e.type}:${e.target}`).join(" | "),
);
console.log("ticks", r.ir.ticks.length, "animates", r.ir.animates.length);
