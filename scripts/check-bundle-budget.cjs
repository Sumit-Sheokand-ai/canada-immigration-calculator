const fs = require('node:fs/promises');
const path = require('node:path');

function toKB(bytes) {
  return bytes / 1024;
}
function readLimit(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readAssets(assetDir) {
  const entries = await fs.readdir(assetDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const assets = await Promise.all(files.map(async (name) => {
    const fullPath = path.join(assetDir, name);
    const stat = await fs.stat(fullPath);
    return {
      name,
      bytes: stat.size,
      ext: path.extname(name).toLowerCase(),
    };
  }));
  return assets;
}

async function main() {
  const assetDir = process.env.BUNDLE_DIR || path.join(process.cwd(), 'dist', 'assets');
  const limits = {
    maxJsTotalKB: readLimit('MAX_JS_TOTAL_KB', 900),
    maxCssTotalKB: readLimit('MAX_CSS_TOTAL_KB', 120),
    maxLargestJsKB: readLimit('MAX_LARGEST_JS_KB', 250),
    maxLargestCssKB: readLimit('MAX_LARGEST_CSS_KB', 90),
  };

  let assets;
  try {
    assets = await readAssets(assetDir);
  } catch (error) {
    console.error(`[bundle-budget] Failed to read assets from "${assetDir}": ${error.message}`);
    process.exit(1);
  }

  const jsAssets = assets.filter((asset) => asset.ext === '.js');
  const cssAssets = assets.filter((asset) => asset.ext === '.css');
  const jsTotalKB = toKB(jsAssets.reduce((sum, asset) => sum + asset.bytes, 0));
  const cssTotalKB = toKB(cssAssets.reduce((sum, asset) => sum + asset.bytes, 0));
  const largestJsKB = toKB(jsAssets.reduce((max, asset) => Math.max(max, asset.bytes), 0));
  const largestCssKB = toKB(cssAssets.reduce((max, asset) => Math.max(max, asset.bytes), 0));

  const failures = [];
  if (jsTotalKB > limits.maxJsTotalKB) {
    failures.push(`Total JS ${jsTotalKB.toFixed(1)}KB exceeds ${limits.maxJsTotalKB}KB`);
  }
  if (cssTotalKB > limits.maxCssTotalKB) {
    failures.push(`Total CSS ${cssTotalKB.toFixed(1)}KB exceeds ${limits.maxCssTotalKB}KB`);
  }
  if (largestJsKB > limits.maxLargestJsKB) {
    failures.push(`Largest JS chunk ${largestJsKB.toFixed(1)}KB exceeds ${limits.maxLargestJsKB}KB`);
  }
  if (largestCssKB > limits.maxLargestCssKB) {
    failures.push(`Largest CSS chunk ${largestCssKB.toFixed(1)}KB exceeds ${limits.maxLargestCssKB}KB`);
  }

  console.log('[bundle-budget] Asset directory:', assetDir);
  console.log('[bundle-budget] JS total:', `${jsTotalKB.toFixed(1)}KB`);
  console.log('[bundle-budget] CSS total:', `${cssTotalKB.toFixed(1)}KB`);
  console.log('[bundle-budget] Largest JS chunk:', `${largestJsKB.toFixed(1)}KB`);
  console.log('[bundle-budget] Largest CSS chunk:', `${largestCssKB.toFixed(1)}KB`);

  if (failures.length > 0) {
    console.error('[bundle-budget] Budget check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('[bundle-budget] OK');
}

main();
