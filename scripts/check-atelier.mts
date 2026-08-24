import { readFileSync } from "node:fs";
import { compileSource } from "../src/pipeline.ts";
const r = compileSource(readFileSync("examples/atelier.viva","utf8"), "atelier.viva");
if (!r.ir) { console.error(r.error); process.exit(1); }
console.log("OK", r.ir.name, "layers=", r.ir.scene.layers.map(l => `${l.name}:{${Object.keys(l.props).join(",")}}`).join(" | "));
