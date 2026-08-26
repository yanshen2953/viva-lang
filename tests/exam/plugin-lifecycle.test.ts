/**
 * R1-C: out-of-repo plugins declare expand deps, opt into post-passes,
 * and unregistered hooks cannot mutate their products.
 */
import { afterEach, describe, expect, it } from "vitest";
import { literal } from "../../src/ast";
import { compileSource } from "../../src/pipeline";
import { evaluate } from "../../src/eval";
import {
  listCompileHooks,
  orderWidgetDecls,
  registerCompileHook,
  registerWidget,
  resetWidgetPlugins,
  unregisterCompileHook,
  unregisterWidget,
} from "../../src/widgets";

afterEach(() => {
  unregisterWidget("ext.dock");
  unregisterCompileHook("evil-shift");
  resetWidgetPlugins();
});

const PAGED = `artifact Dock
scene
  unit: mm
  page: a4
  column: single
  width: 89
  height: 400
  background: #ffffff
widget layout.board
  title: "Board"
  caption: "caption"
  guides: false
widget ext.dock
`;

describe("R1-C plugin lifecycle", () => {
  it("orders expand by declared after, so a dock can sit in the board body", () => {
    registerWidget({
      name: "ext.dock",
      after: ["layout.board"],
      allowHooks: ["folio"],
      expand({ artifact }) {
        const body = artifact.frames.find((f) => f.name === "body");
        const pair0 = (expr: { kind: string; value?: number; items?: { kind: string; value?: number }[] } | undefined, fallback: number) => {
          if (!expr) return fallback;
          if (expr.kind === "number") return expr.value ?? fallback;
          if (expr.kind === "array" && expr.items?.[0]?.kind === "number") return expr.items[0].value ?? fallback;
          return fallback;
        };
        const x = pair0(body?.props.x, 4);
        const y = pair0(body?.props.y, 4);
        artifact.frames.push({
          name: "dock",
          props: {
            x: literal(x),
            y: literal(y),
            w: literal(20),
            h: literal(12),
          },
          span: artifact.span,
          owner: "ext.dock",
        });
        artifact.scene?.layers.push({
          name: "__ext_dock",
          span: artifact.span,
          props: {},
          owner: "ext.dock",
          items: [
            {
              kind: "node",
              name: "dockMark",
              props: {
                x: literal(x + 2),
                y: literal(y + 2),
                w: literal(8),
                h: literal(8),
                fill: literal("#111111"),
              },
              span: artifact.span,
            },
          ],
        });
        artifact.events.push({
          type: "click",
          target: "dockMark",
          body: [{ kind: "assign", target: ["picked"], value: literal(1), span: artifact.span }],
          span: artifact.span,
        });
      },
    });
    const names = orderWidgetDecls([{ name: "ext.dock" }, { name: "layout.board" }]).map((w) => w.name);
    expect(names).toEqual(["layout.board", "ext.dock"]);
    const result = compileSource(PAGED, "dock.viva", { handbookIds: ["print-nature"] });
    expect(result.error, result.error ?? "").toBeNull();
    const ir = result.ir!;
    expect(ir.frames.some((f) => f.name === "body")).toBe(true);
    expect(ir.frames.some((f) => f.name === "dock")).toBe(true);
    const body = ir.frames.find((f) => f.name === "body")!;
    const dock = ir.frames.find((f) => f.name === "dock")!;
    const bodyX = evaluate(body.props.x, [ir.state, ir.data]);
    const dockX = evaluate(dock.props.x, [ir.state, ir.data]);
    expect(dockX).toBe(Array.isArray(bodyX) ? bodyX[0] : bodyX);
    expect(ir.events.some((e) => e.type === "click" && e.target === "dockMark")).toBe(true);
    expect(listCompileHooks()).toEqual(expect.arrayContaining(["folio"]));
    expect(ir.scene.layers.some((l) => l.name === "__page_folio" || /folio/.test(l.name))).toBe(true);
  });

  it("restores plugin nodes when an unregistered post-pass tries to move them", () => {
    registerWidget({
      name: "ext.dock",
      after: ["layout.board"],
      allowHooks: [],
      expand({ artifact }) {
        artifact.scene?.layers.push({
          name: "__ext_dock",
          span: artifact.span,
          props: {},
          owner: "ext.dock",
          items: [
            {
              kind: "node",
              name: "dockMark",
              props: { x: literal(11), y: literal(17), w: literal(6), h: literal(6) },
              span: artifact.span,
            },
          ],
        });
      },
    });
    registerCompileHook({
      name: "evil-shift",
      after: ["newspaper"],
      run(artifact) {
        for (const layer of artifact.scene?.layers ?? []) {
          for (const item of layer.items) {
            if (item.kind === "node") item.props.x = literal(0);
          }
        }
      },
    });
    const result = compileSource(PAGED, "dock-shift.viva");
    expect(result.error, result.error ?? "").toBeNull();
    const layer = result.ir!.scene.layers.find((l) => l.name === "__ext_dock");
    expect(layer).toBeTruthy();
    const node = layer!.items.find((i) => i.kind === "node" && i.name === "dockMark");
    expect(node?.kind).toBe("node");
    if (node?.kind === "node") {
      expect(evaluate(node.props.x, [{}, {}])).toBe(11);
      expect(evaluate(node.props.y, [{}, {}])).toBe(17);
    }
    const shifted = result.ir!.scene.layers
      .flatMap((l) => l.items)
      .some((i) => i.kind === "node" && i.name !== "dockMark" && i.props.x?.kind === "number" && i.props.x.value === 0);
    expect(shifted, "evil-shift must still run on unowned nodes").toBe(true);
  });

  it("names the plugin when the restore is skipped (anti-proof)", () => {
    registerWidget({
      name: "ext.dock",
      after: ["layout.board"],
      allowHooks: ["evil-shift"],
      expand({ artifact }) {
        artifact.scene?.layers.push({
          name: "__ext_dock",
          span: artifact.span,
          props: {},
          owner: "ext.dock",
          items: [
            {
              kind: "node",
              name: "dockMark",
              props: { x: literal(11), y: literal(17), w: literal(6), h: literal(6) },
              span: artifact.span,
            },
          ],
        });
      },
    });
    registerCompileHook({
      name: "evil-shift",
      after: ["newspaper"],
      run(artifact) {
        for (const layer of artifact.scene?.layers ?? []) {
          for (const item of layer.items) {
            if (item.kind === "node") item.props.x = literal(0);
          }
        }
      },
    });
    const result = compileSource(PAGED, "dock-opt-in.viva");
    expect(result.error, result.error ?? "").toBeNull();
    const layer = result.ir!.scene.layers.find((l) => l.name === "__ext_dock");
    const node = layer?.items.find((i) => i.kind === "node" && i.name === "dockMark");
    expect(node?.kind).toBe("node");
    if (node?.kind === "node") {
      expect(evaluate(node.props.x, [{}, {}]), "ext.dock").toBe(0);
    }
  });
});
