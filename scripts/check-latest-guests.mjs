import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSession } from '../packages/terrarium/node_modules/@aletheia-works/formicarium/runtime/node/api.js';

import { releaseVersion } from './latest-guests.mjs';

const site = path.resolve(process.argv[2], 'web');
const { convertFixture } = await import(
  pathToFileURL(path.join(site, 'formicarium-guest-distribution/fixtures.js'))
    .href
);
const { tools } = JSON.parse(
  await readFile(path.join(site, 'latest-resolutions.json'), 'utf8'),
);
const { builds } = JSON.parse(
  await readFile(path.join(site, 'dist/builds.json'), 'utf8'),
);
for (const [tool, resolved] of Object.entries(tools)) {
  const guest = await readFile(
    path.join(site, builds[tool][resolved.ref].guest.url),
  );
  const build = builds[tool][resolved.ref];
  const entries =
    tool === 'biome'
      ? convertFixture(
          JSON.parse(
            await readFile(
              path.join(site, build.fixtures['biome-basic'].url),
              'utf8',
            ),
          ),
          { cwd: '/work/app' },
        )
      : [];
  const session = await createSession({
    cwd: '/work',
    entries,
  });
  try {
    if (tool === 'biome') await session.setCwd('/work/app');
    const result = await session.run({
      guest,
      args: ['--version'],
      timeoutMs: 600_000,
    });
    const output = new TextDecoder().decode(result.stdout);
    if (
      result.exitCode !== 0 ||
      output.match(/\b\d+\.\d+\.\d+\b/)?.[0] !== releaseVersion(resolved.ref)
    )
      throw new Error(
        `${tool} version failed: ${JSON.stringify(result)} ${output}`,
      );
    if (tool === 'biome') {
      const formatted = await session.run({
        guest,
        args: ['format', '--write', 'example.js'],
        timeoutMs: 120_000,
      });
      if (
        formatted.exitCode !== 0 ||
        !new TextDecoder()
          .decode(await session.readFile('/work/app/example.js'))
          .includes('const greeting = {')
      )
        throw new Error(
          `Biome formatting failed: ${formatted.exitCode} ${new TextDecoder().decode(formatted.stderr)} ${new TextDecoder().decode(formatted.stdout)}`,
        );
      const lint = await session.run({
        guest,
        args: ['lint', 'lint.js'],
        timeoutMs: 120_000,
      });
      if (
        lint.exitCode !== 1 ||
        !new TextDecoder().decode(lint.stderr).includes('noDebugger')
      )
        throw new Error('Biome lint diagnostics failed');
    }
    console.log(`${tool}: ${resolved.ref} ${resolved.commit} ${output.trim()}`);
  } finally {
    await session.dispose();
  }
}
