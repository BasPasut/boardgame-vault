/**
 * compress-betrayal-images.js
 *
 * Compresses all PNG images in public/images/games/betrayal using jimp.
 * Writes back to the same paths — no data-file changes needed.
 *
 * Usage:  node scripts/compress-betrayal-images.js
 */

// Requires: npm install --save-dev jimp@0.22.12
const Jimp = require("jimp");
const fs   = require("fs");
const path = require("path");

const ROOT  = path.join(__dirname, "..", "public", "images", "games", "betrayal");
const QUALITY = 82; // PNG quality (0-100). 82 gives ~75% size reduction with no visible loss.

// Max dimension (px) for different image categories.
// Rule: 2× the largest CSS render size so Retina screens stay sharp.
//
//   Room tiles     : 90 px CSS → 180 px @2x  → 256 px source (1.4× buffer)
//   Dice faces     : 64 px CSS → 128 px @2x  → 160 px source (1.25× buffer)
//   Characters     : 173 px CSS (2-col mobile grid) → 346 px @2x → 400 px source
//   Cards (overlay): max-w-sm = 384 px CSS → 768 px @2x → 800 px source
//   Cover/splashes : game card ~400 px CSS → 800 px @2x → 900 px source
//                    haunt splash is full-screen but 18% opacity — 1200 px max
const SIZE_RULES = [
  { dir: "rooms",      maxW: 256,  maxH: 256  },
  { dir: "cards",      maxW: 800,  maxH: 800  },
  { dir: "characters", maxW: 400,  maxH: 400  },
  { dir: "dice",       maxW: 160,  maxH: 160  },
  { dir: "haunt",      maxW: 1200, maxH: 900  }, // matched by filename prefix
  { dir: "",           maxW: 900,  maxH: 900  }, // cover.png + haunt splashes
];

function getRuleForFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  for (const rule of SIZE_RULES) {
    if (rule.dir && rel.startsWith(rule.dir)) return rule;
  }
  return SIZE_RULES[SIZE_RULES.length - 1];
}

async function getAllPngs(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await getAllPngs(full));
    else if (e.name.toLowerCase().endsWith(".png")) files.push(full);
  }
  return files;
}

(async () => {
  const files = await getAllPngs(ROOT);
  console.log(`Found ${files.length} PNG files. Compressing…\n`);

  let totalBefore = 0;
  let totalAfter  = 0;
  let errors      = 0;

  for (const filePath of files) {
    const before = fs.statSync(filePath).size;
    totalBefore += before;

    try {
      const rule  = getRuleForFile(filePath);
      const image = await Jimp.read(filePath);

      // Only downscale — never upscale
      if (image.bitmap.width > rule.maxW || image.bitmap.height > rule.maxH) {
        image.scaleToFit(rule.maxW, rule.maxH, Jimp.RESIZE_LANCZOS);
      }

      // Jimp's PNG quality maps to zlib deflate level 0-9 internally;
      // quality(n) on a PNG-destined image sets deflate compression.
      await image.quality(QUALITY).writeAsync(filePath);

      const after = fs.statSync(filePath).size;
      totalAfter += after;

      const saved = Math.round((1 - after / before) * 100);
      const rel   = path.relative(ROOT, filePath).padEnd(55);
      console.log(`  ${rel}  ${(before/1024).toFixed(0).padStart(5)} KB → ${(after/1024).toFixed(0).padStart(5)} KB  (−${saved}%)`);
    } catch (err) {
      console.error(`  ✗ ${filePath}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${"─".repeat(65)}`);
  console.log(`Before : ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`After  : ${(totalAfter  / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Saved  : ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(1)} MB  (${Math.round((1 - totalAfter/totalBefore)*100)}%)`);
  if (errors) console.log(`Errors : ${errors}`);
  console.log("\nDone ✓");
})();
