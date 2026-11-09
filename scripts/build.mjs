// Bygger den statiske side til dist/: kopierer site/ og data/.
// Cloudflare Pages: build-kommando "node scripts/build.mjs", output-mappe "dist".
import { cpSync, rmSync, mkdirSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("site", "dist", { recursive: true });
cpSync("data", "dist/data", { recursive: true });
console.log("Bygget til dist/");
