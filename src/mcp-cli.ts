#!/usr/bin/env node
import { runVivaMcpServer } from "./mcp/server.js";

runVivaMcpServer().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
