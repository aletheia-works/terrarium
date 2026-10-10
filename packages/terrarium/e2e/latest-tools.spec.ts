import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SITE } from '../playwright.formicarium.config.ts';
import type { TerrariumTerminal } from '../src/terminal.ts';

const site = process.env.TERRARIUM_SITE_DIR;
if (!site) throw new Error('TERRARIUM_SITE_DIR required');
const resolutions = JSON.parse(
  readFileSync(path.join(site, 'web/latest-resolutions.json'), 'utf8'),
) as {
  tools: Record<string, { ref: string; commit: string }>;
};
for (const [tool, resolved] of Object.entries(resolutions.tools)) {
  test(`${tool} executes the latest stable release at its resolved commit`, async ({
    page,
  }) => {
    await page.goto(`${SITE}/element.html?tool=${encodeURIComponent(tool)}`);
    await page.locator('terrarium-terminal').waitFor();
    const ready = await page.evaluate(
      () =>
        (document.querySelector('terrarium-terminal') as TerrariumTerminal)
          .ready,
    );
    expect(ready).toMatchObject({
      tool,
      ref: resolved.ref,
      commit: resolved.commit,
    });
    const result = await page.evaluate(
      (tool) =>
        (document.querySelector('terrarium-terminal') as TerrariumTerminal).run(
          `${tool} --version`,
        ),
      tool,
    );
    expect(result.code).toBe(0);
    expect(result.output.match(/\b\d+\.\d+\.\d+\b/)?.[0]).toBe(
      resolved.ref.replace(/^v/, ''),
    );
  });
}
