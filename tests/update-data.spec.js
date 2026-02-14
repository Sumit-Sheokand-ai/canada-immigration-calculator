import { describe, it, expect } from 'vitest';
import { mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('scripts/update-data.cjs', () => {
  it('updates latestDraws output and remains parseable by app imports', async () => {
    const repoRoot = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), 'crs-update-data-'));
    const tempDataPath = path.join(tempDir, 'crsData.js');
    const sourceDataPath = path.join(repoRoot, 'src', 'data', 'crsData.js');
    const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'ircc-rounds-sample.json');
    const scriptPath = path.join(repoRoot, 'scripts', 'update-data.cjs');

    await copyFile(sourceDataPath, tempDataPath);

    await execFileAsync('node', [scriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        IRCC_JSON_OVERRIDE_FILE: fixturePath,
        CRS_DATA_PATH: tempDataPath,
      },
    });

    const mod = await import(`${pathToFileURL(tempDataPath).href}?v=${Date.now()}`);
    expect(mod.latestDraws).toBeTypeOf('object');
    expect(mod.latestDraws.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(mod.latestDraws.generalProgram)).toBe(true);
    expect(Array.isArray(mod.latestDraws.categoryBased)).toBe(true);
    expect(Array.isArray(mod.latestDraws.pnpDraws)).toBe(true);
    expect(mod.latestDraws.averageCutoff).toBeGreaterThan(0);
  });

  it('fails fast with clear error if IRCC JSON schema changes', async () => {
    const repoRoot = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), 'crs-update-data-bad-'));
    const badFixturePath = path.join(tempDir, 'bad-ircc.json');
    const tempDataPath = path.join(tempDir, 'crsData.js');
    const sourceDataPath = path.join(repoRoot, 'src', 'data', 'crsData.js');
    const scriptPath = path.join(repoRoot, 'scripts', 'update-data.cjs');

    await writeFile(badFixturePath, JSON.stringify({ badRoot: [] }), 'utf8');
    await copyFile(sourceDataPath, tempDataPath);

    let failed = false;
    try {
      await execFileAsync('node', [scriptPath], {
        cwd: repoRoot,
        env: {
          ...process.env,
          IRCC_JSON_OVERRIDE_FILE: badFixturePath,
          CRS_DATA_PATH: tempDataPath,
        },
      });
    } catch (err) {
      failed = true;
      const combined = `${err.stdout || ''}\n${err.stderr || ''}`;
      expect(combined).toContain('schema changed');
    }
    expect(failed).toBe(true);
  });
});
