import { describe, expect, it } from "vitest";
import {
  createVivaAgentHost,
  VIVA_INLINE_PLUGIN_ID,
} from "../../src/agent";
import {
  INLINE_DEFAULT_HANDBOOKS,
  createVivaInlineEmbed,
} from "../../src/embed/inline.js";

describe("inline embed plugin", () => {
  it("registers default viva inline domain view", () => {
    const host = createVivaAgentHost();
    const view = host.domains.resolve("application/vnd.viva");
    expect(view?.id).toBe(VIVA_INLINE_PLUGIN_ID);
  });

  it("suggests inline view for viva pipeline artifacts", () => {
    const host = createVivaAgentHost();
    const view = host.domains
      .list()
      .find((v) => v.id === VIVA_INLINE_PLUGIN_ID);
    expect(view).toBeDefined();
    const suggested = host.domains.list().find((v) => v.id === VIVA_INLINE_PLUGIN_ID);
    expect(suggested?.accept.some((a) => a.includes("viva"))).toBe(true);
  });

  it("defaults inline embed to print-nature handbook", () => {
    expect(INLINE_DEFAULT_HANDBOOKS).toEqual(["print-nature"]);
    expect(typeof createVivaInlineEmbed).toBe("function");
  });
});
