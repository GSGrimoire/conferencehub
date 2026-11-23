// Bygger den statiske side til dist/: kopierer site/ og data/.
// Cloudflare Workers udgiver dist/ fra Wrangler-konfigurationen.
import { cpSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("site", "dist", { recursive: true });
cpSync("data", "dist/data", { recursive: true });
if (process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH !== "main") {
  writeFileSync("dist/config.js", "window.CH_CONFIG = {};\n");
}
console.log("Bygget til dist/");
