/**
 * Rasterize resources/icon.svg + resources/splash.svg into the PNG inputs
 * `@capacitor/assets` expects (1024x1024 icon.png, 2732x2732 splash.png +
 * dark variant). Run via `node scripts/rasterize-icons.mjs`.
 *
 * Why: capacitor-assets v3 wants PNG sources by default. Rather than ship
 * a giant PNG into git, we keep the source-of-truth as SVG and re-render
 * on demand.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const resourcesDir = join(root, "resources");

// sharp is a transitive dep of @capacitor/assets — resolve it from there.
const { default: sharp } = await import("sharp");

async function render(svgRel, pngRel, size) {
  const svgPath = join(resourcesDir, svgRel);
  const outPath = join(resourcesDir, pngRel);
  mkdirSync(dirname(outPath), { recursive: true });
  const buf = readFileSync(svgPath);
  await sharp(buf, { density: 384 })  // high DPI rasterization
    .resize(size, size, { fit: "contain", background: { r: 11, g: 16, b: 32, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ${pngRel}  (${size}×${size})`);
}

console.log("Rasterizing БЕК kiosk icon + splash...");
await render("icon.svg", "icon.png", 1024);
await render("splash.svg", "splash.png", 2732);
// Capacitor uses a single splash file for both light/dark when the theme is
// already dark — duplicate so the generator doesn't warn.
await render("splash.svg", "splash-dark.png", 2732);
console.log("done.");
