import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { exportBeatAnimation, ffmpegAvailable } from "../../src/export/index.js";
import { createSimWorld, stepSimWorld } from "../../src/simulate.js";

function compile(file: string, handbookIds: string[]) {
  const src = readFileSync(file, "utf8");
  const result = compileSource(src, file, { handbookIds });
  expect(result.error, file).toBeNull();
  expect(result.ir, file).toBeTruthy();
  return { src, ir: result.ir! };
}

describe("showcase examples", () => {
  it("compiles nocturne / aurora / harbor with their handbooks", () => {
    const nocturne = compile("examples/nocturne.viva", ["print-nature"]);
    expect(nocturne.ir.timeline?.beats).toBe(4);
    expect(nocturne.src).toMatch(/夜曲|应答|IL-6/);

    const aurora = compile("examples/aurora.viva", ["dashboard"]);
    expect(aurora.ir.ticks.length).toBeGreaterThan(0);
    expect(aurora.src).toMatch(/极光台|PCA/);

    const harbor = compile("examples/harbor.viva", ["dashboard"]);
    expect(harbor.ir.events.some((e) => e.type === "drag" && e.target === "ships")).toBe(true);
    expect(harbor.ir.events.some((e) => e.type === "click" && e.target === "piers")).toBe(true);
    expect(harbor.src).toMatch(/夜港|HARBOR/);
  });

  it("Chinese and English READMEs use markdown images and ship an npm tarball", () => {
    const zh = readFileSync("README.md", "utf8");
    const en = readFileSync("README.en.md", "utf8");
    expect(zh).toMatch(/\[English\]\(\.\/README\.en\.md\)/);
    expect(en).toMatch(/\[中文\]\(\.\/README\.md\)/);
    expect(zh).not.toMatch(/不是.{0,8}而是/);
    expect(en).not.toMatch(/not a .+ but /i);
    for (const md of [zh, en]) {
      expect(md).toMatch(/!\[.*\]\(\.\/docs\/gallery\/harbor\.png\)/);
      expect(md).toMatch(/!\[.*\]\(\.\/docs\/gallery\/nocturne\.png\)/);
      expect(md).toMatch(/!\[.*\]\(\.\/docs\/gallery\/aurora\.png\)/);
      expect(md).toMatch(/!\[.*\]\(\.\/docs\/gallery\/harbor\.gif\)/);
      expect(md).toContain("packages/viva-lang-0.1.0.tgz");
      expect(md).toMatch(/npm install -g \.\/packages\/viva-lang-0\.1\.0\.tgz/);
      expect(md.indexOf("npm install -g")).toBeLessThan(md.indexOf("docker compose"));
    }
    for (const file of [
      "docs/gallery/harbor.png",
      "docs/gallery/nocturne.png",
      "docs/gallery/aurora.png",
      "docs/gallery/harbor.gif",
      "packages/viva-lang-0.1.0.tgz",
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("playground mounts the three showcase cards", () => {
    const playground = readFileSync("playground/main.ts", "utf8");
    expect(playground).toMatch(/harbor\.viva/);
    expect(playground).toMatch(/aurora\.viva/);
    expect(playground).toMatch(/nocturne\.viva/);
    expect(playground).toMatch(/Harbor:/);
    expect(playground).toMatch(/load\("Harbor"\)/);
  });

  it("harbor click and ship drag mutate the same world", () => {
    const { ir } = compile("examples/harbor.viva", ["dashboard"]);
    const world = createSimWorld(ir);
    const piers = world.data.piers as { name: string }[];
    const ships = world.data.ships as { name: string; x: number; y: number }[];
    stepSimWorld(ir, world, {
      events: [{ type: "click", target: "piers", item: { pier: piers[0] } }],
    });
    expect((world.state.selected as { name: string }).name).toBe("北栈");
    const before = ships[0]!.x;
    stepSimWorld(ir, world, {
      events: [{ type: "drag", target: "ships", item: { ship: ships[0] }, event: { x: 300, y: 460 } }],
    });
    expect(ships[0]!.x).not.toBe(before);
    expect(ships[0]!.x).toBeCloseTo(273, 0);
  });

  it("aurora ticks rotate the orbit and a click lights a mark", () => {
    const { ir } = compile("examples/aurora.viva", ["dashboard"]);
    const world = createSimWorld(ir);
    const yaw0 = Number(world.state.yaw);
    stepSimWorld(ir, world, { ticks: 4 });
    expect(Number(world.state.yaw)).toBeGreaterThan(yaw0);
    const pca = world.data.pca as { id: string }[];
    stepSimWorld(ir, world, {
      events: [{ type: "click", target: "pcaPts", item: { p: pca[0] } }],
    });
    expect(world.state.mark).toBe(pca[0]!.id);
  });

  it("nocturne clock encodes a gif when ffmpeg is present", async ({ skip }) => {
    if (!(await ffmpegAvailable())) skip();
    const src = readFileSync("examples/nocturne.viva", "utf8");
    const gif = await exportBeatAnimation(
      src,
      "gif",
      { width: 240, handbookIds: ["print-nature"], beats: true },
      "nocturne.viva",
    );
    expect(gif.mime).toBe("image/gif");
    expect(String.fromCharCode(...gif.bytes.slice(0, 6))).toBe("GIF89a");
    expect(gif.bytes.byteLength).toBeGreaterThan(400);
  }, 60_000);
});
