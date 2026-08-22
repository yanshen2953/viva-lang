import { compileSource } from "../src/pipeline.js";
import { createReviewController } from "../src/review/controller.js";
import { listSelectableNodes } from "../src/review/nodes.js";
import { renderSvgFromIr } from "../src/export/static-svg.js";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("examples/hello.viva", "utf8");
const { ir } = compileSource(src, "hello.viva");
if (!ir) throw new Error("compile failed");
const nodes = listSelectableNodes(ir);
const svg = renderSvgFromIr(ir);
const ctrl = createReviewController({
  runtime: {
    exportSvg: () => svg,
    getSvg: () => null,
    hitTest: () => null,
    scenePoint: () => ({ x: 0, y: 0 }),
    listNodes: () => nodes,
  },
  getSource: () => src,
});
ctrl.selectByRegion({ kind: "rect", x: 0, y: 0, w: 500, h: 500 }, "replace");
ctrl.addFeedback({ kind: "fix", text: "把计数文案改成 Hello Agent", severity: "error" });
ctrl.addFeedback({ kind: "style", text: "圆点 fill 改成 #f5a524", severity: "warn" });
const snap = ctrl.snapshot();
writeFileSync("/opt/cursor/artifacts/agent_brief_sample.md", snap.agentBrief);
writeFileSync(
  "/opt/cursor/artifacts/selection_pack.json",
  JSON.stringify(
    { ids: snap.payload.ids, names: snap.payload.names, feedback: snap.payload.feedback },
    null,
    2,
  ),
);
console.log(snap.agentBrief);
console.log("selected", snap.payload.ids);
