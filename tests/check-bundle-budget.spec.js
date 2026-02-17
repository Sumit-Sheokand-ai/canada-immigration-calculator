import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function createAssetDir({ jsBytes = 1024, cssBytes = 512 } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'crs-bundle-budget-'));
  const assetDir = path.join(base, 'assets');
  await mkdir(assetDir, { recursive: true });
  await writeFile(path.join(assetDir, 'main.js'), 'x'.repeat(jsBytes), 'utf8');
  await writeFile(path.join(assetDir, 'main.css'), 'y'.repeat(cssBytes), 'utf8');
  return assetDir;
}

describe('scripts/check-bundle-budget.cjs', () => {
  it('passes when bundle sizes are under thresholds', async () => {
    const repoRoot = process.cwd();
    const scriptPath = path.join(repoRoot, 'scripts', 'check-bundle-budget.cjs');
    const bundleDir = await createAssetDir({ jsBytes: 1400, cssBytes: 900 });

    const { stdout } = await execFileAsync('node', [scriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BUNDLE_DIR: bundleDir,
        MAX_JS_TOTAL_KB: '20',
        MAX_CSS_TOTAL_KB: '10',
        MAX_LARGEST_JS_KB: '20',
        MAX_LARGEST_CSS_KB: '10',
      },
    });

    expect(stdout).toContain('[bundle-budget] OK');
  });

  it('fails when bundle sizes exceed thresholds', async () => {
    const repoRoot = process.cwd();
    const scriptPath = path.join(repoRoot, 'scripts', 'check-bundle-budget.cjs');
    const bundleDir = await createAssetDir({ jsBytes: 5000, cssBytes: 5000 });

    let failed = false;
    try {
      await execFileAsync('node', [scriptPath], {
        cwd: repoRoot,
        env: {
          ...process.env,
          BUNDLE_DIR: bundleDir,
          MAX_JS_TOTAL_KB: '1',
          MAX_CSS_TOTAL_KB: '1',
          MAX_LARGEST_JS_KB: '1',
          MAX_LARGEST_CSS_KB: '1',
        },
      });
    } catch (error) {
      failed = true;
      const combined = `${error.stdout || ''}\n${error.stderr || ''}`;
      expect(combined).toContain('Budget check failed');
      expect(combined).toContain('Total JS');
      expect(combined).toContain('Total CSS');
    }

    expect(failed).toBe(true);
  });
});
