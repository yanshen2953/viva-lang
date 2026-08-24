import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import type { VisualIR } from "../ir.js";
import { renderSvgFromIr } from "../export/static-svg.js";
import { flattenNodesFromIr } from "../export/static-svg.js";
import type { CheckOptions } from "./types.js";
import { withIrStyleContext } from "./style-context.js";

export type RasterizedArtifact = {
  png: Uint8Array;
  width: number;
  height: number;
  background: string;
  inkRatio?: number;
  colorCount?: number;
};

export async function rasterizeIr(
  ir: VisualIR,
  opts: Pick<CheckOptions, "rasterWidth"> = {},
): Promise<RasterizedArtifact> {
  const rasterWidth = opts.rasterWidth ?? 960;
  const { scene } = withIrStyleContext(ir, () => ({ scene: flattenNodesFromIr(ir).scene }));
  const svg = withIrStyleContext(ir, () => renderSvgFromIr(ir));
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: rasterWidth },
    background: scene.background,
  });
  const png = resvg.render().asPng();
  const meta = await sharp(png).metadata();
  const width = meta.width ?? rasterWidth;
  const height =
    meta.height ?? Math.round((scene.height / scene.width) * rasterWidth);

  return {
    png,
    width,
    height,
    background: scene.background,
  };
}
