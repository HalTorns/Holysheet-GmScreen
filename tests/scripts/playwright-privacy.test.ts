// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

import { expect, test } from 'vitest'

test('failed Playwright assertions never capture input values in automatic error snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boilerplate-privacy-test-'))
  const sentinel = `nonsecret-probe-${randomUUID()}`
  const packageRoot = dirname(
    fileURLToPath(import.meta.resolve('@playwright/test/package.json'))
  )
  try {
    await writeFile(
      join(directory, 'playwright.config.mjs'),
      `
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default { testDir: '.', workers: 1, reporter: 'line', use: { trace: 'off', screenshot: 'off', video: 'off' } };
`
    )
    await writeFile(
      join(directory, 'privacy.spec.mjs'),
      `
import { test, expect } from ${JSON.stringify(import.meta.resolve('@playwright/test'))};
for (const kind of ['missing', 'present']) {
  test(kind, async ({ page }) => {
    await page.setContent('<label>Verification code<input></label>');
    await page.getByLabel('Verification code').evaluate((element, value) => {
      element.defaultValue = value;
    }, process.env.PRIVACY_PROBE_TEXT);
    await page.getByLabel('Verification code').fill(process.env.PRIVACY_PROBE_TEXT);
    if (kind === 'missing') await expect(page.getByRole('heading')).toBeVisible({ timeout: 50 });
    else await expect(page.getByLabel('Verification code')).toBeDisabled({ timeout: 50 });
  });
}
`
    )
    const result = spawnSync(
      process.execPath,
      [join(packageRoot, 'cli.js'), 'test'],
      {
        cwd: directory,
        env: { ...process.env, PRIVACY_PROBE_TEXT: sentinel },
        encoding: 'utf-8',
        timeout: 20_000,
      }
    )
    // Both assertions must actually fail; a skipped or broken probe is not privacy proof.
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('2 failed')
    const output = stripVTControlCharacters(`${result.stdout}${result.stderr}`)
    expect(
      output.includes('Expected: disabled') &&
        output.includes('Received: enabled') &&
        output.includes('element(s) not found'),
      'Both probes must fail on their intended locator assertions'
    ).toBe(true)
    let exposed = `${result.stdout}${result.stderr}`.includes(sentinel)
    for (const entry of await readdir(directory, { recursive: true })) {
      if (!entry.endsWith('.md') && !entry.endsWith('.json')) continue
      exposed ||= (await readFile(join(directory, entry), 'utf-8')).includes(
        sentinel
      )
    }
    expect(
      exposed,
      'Automatic failure output exposed the synthetic input value'
    ).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
