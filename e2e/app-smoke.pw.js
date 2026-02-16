import { expect, test } from '@playwright/test';

async function ensureStepAnswered(page) {
  const nextButton = page.locator('.wizard-nav .btn-next').first();
  for (let i = 0; i < 8; i += 1) {
    if (await nextButton.isEnabled()) return;
    const firstUnselected = page.locator('.step-wrap .opt-btn:not(.selected)').first();
    if ((await firstUnselected.count()) === 0) break;
    await firstUnselected.click();
    await page.waitForTimeout(40);
  }
}

async function completeWizardWithFirstChoices(page) {
  for (let i = 0; i < 90; i += 1) {
    if (await page.locator('.results').isVisible().catch(() => false)) return;
    const wizardVisible = await page.locator('.wizard').isVisible().catch(() => false);
    if (!wizardVisible) {
      await page.waitForTimeout(120);
      continue;
    }
    await ensureStepAnswered(page);
    const nextButton = page.locator('.wizard-nav .btn-next').first();
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await page.waitForTimeout(60);
  }
  throw new Error('Wizard did not complete within expected step limit.');
}

test('welcome -> wizard -> results main flow works', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.welcome')).toBeVisible();
  await page.locator('.btn-start').click();
  await completeWizardWithFirstChoices(page);
  await expect(page.locator('.results')).toBeVisible();
  await expect(page.locator('.status-card')).toBeVisible();
});

test('wizard progress resume banner appears after reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.btn-start').click();
  await expect(page.locator('.wizard')).toBeVisible();
  await ensureStepAnswered(page);
  await page.reload();
  await expect(page.locator('.welcome')).toBeVisible();
  await expect(page.locator('.btn-resume')).toBeVisible();
});

test('header theme and language controls are interactive', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  const initialTheme = await root.getAttribute('data-theme');
  await page.locator('.theme-toggle').click();
  const nextTheme = await root.getAttribute('data-theme');
  expect(nextTheme).not.toBe(initialTheme);

  const languageSelect = page.locator('.lang-select');
  await languageSelect.selectOption('fr');
  await expect(languageSelect).toHaveValue('fr');
  await languageSelect.selectOption('en');
  await expect(languageSelect).toHaveValue('en');
});
