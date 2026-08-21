import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createPromptService, type PromptService, type PromptServiceOptions } from "./prompt.js";

/** Node-only handbook loader from docs/handbooks. */
export function createNodePromptService(
  handbookDir = path.resolve("docs/handbooks"),
  opts: PromptServiceOptions = {},
): PromptService {
  const list = () => {
    if (!existsSync(handbookDir)) return [];
    return readdirSync(handbookDir)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .map((f) => {
        const id = f.replace(/\.md$/, "");
        return { id, title: id, path: path.join(handbookDir, f) };
      });
  };
  return createPromptService({
    ...opts,
    listHandbooks: opts.listHandbooks ?? list,
    loadHandbook:
      opts.loadHandbook ??
      ((id) => {
        const file = path.join(handbookDir, `${id}.md`);
        if (!existsSync(file)) throw new Error(`handbook not found: ${id}`);
        return readFileSync(file, "utf8");
      }),
  });
}
