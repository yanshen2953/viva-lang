/**
 * Prune old capture screenshots from the artifacts store (keeps Playground snappy).
 *
 * Usage:
 *   node scripts/cleanup-artifacts.mjs
 *   node scripts/cleanup-artifacts.mjs --keep figure_atlas_print_nature.png
 */
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

const dir = process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts";
const keep = new Set(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--keep="))
    .map((a) => a.slice("--keep=".length)),
);

const DEFAULT_KEEP = ["figure_atlas_print_nature.png"];

for (const name of DEFAULT_KEEP) keep.add(name);

try {
  const entries = await readdir(dir);
  let removed = 0;
  for (const name of entries) {
    if (!/\.(png|jpg|jpeg|webp|log)$/i.test(name)) continue;
    if (keep.has(name)) continue;
    await unlink(path.join(dir, name));
    removed++;
  }
  console.log(`cleanup-artifacts: removed ${removed} files in ${dir}, kept ${[...keep].join(", ")}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOENT")) {
    console.log(`cleanup-artifacts: ${dir} does not exist, nothing to do`);
  } else {
    console.error(msg);
    process.exit(1);
  }
}
