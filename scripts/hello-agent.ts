import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { compileSource } from "../src/pipeline.ts";
import {
  createVivaAgentHost,
  createInlinePipeline,
} from "../src/agent/index.ts";

const scatter = readFileSync("examples/scatter.viva", "utf8");
const charts = readFileSync("examples/charts.viva", "utf8");

const scatterResult = compileSource(scatter, "scatter.viva");
const chartsResult = compileSource(charts, "charts.viva");

console.log(
  "scatter",
  scatterResult.error ?? "ok",
  "frames=",
  scatterResult.ir?.frames.map((f) => f.name).join(","),
);
console.log(
  "charts",
  chartsResult.error ?? "ok",
  "frames=",
  chartsResult.ir?.frames.length,
  "layers=",
  chartsResult.ir?.scene.layers.length,
);

const host = createVivaAgentHost();
const session = host.createSession({ mount: null, statePolicy: "preserve-data" });
session.compile(scatter, { reason: "generate" });

host.pipeline.register(
  createInlinePipeline(
    "bump",
    "Bump series",
    async () => ({
      series: [
        { t: 1, p: 99 },
        { t: 9, p: 11 },
      ],
    }),
    [{ name: "series", target: "data", path: "series" }],
  ),
);

const handle = await host.pipeline.run("bump", {
  sessionId: session.id,
});
const world = session.getWorld();
console.log(
  "pipeline",
  handle.status,
  "series=",
  JSON.stringify(world.data.series),
);

const bundle = session.exportProvenanceBundle();
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync(
  "/opt/cursor/artifacts/hello_provenance_bundle.json",
  JSON.stringify(bundle, null, 2),
);
console.log(
  "provenance",
  bundle.records.map((r) => r.kind).join(" → "),
  "wrote artifact",
);
