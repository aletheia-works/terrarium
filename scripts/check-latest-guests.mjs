import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createSession } from '../packages/terrarium/node_modules/@aletheia-works/formicarium/runtime/node/api.js';

const site = path.resolve(process.argv[2], 'web');
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
  const session = await createSession({ cwd: '/work', entries: [] });
  try {
    const result = await session.run({
      guest,
      args: ['--version'],
      timeoutMs: 600_000,
    });
    const output = new TextDecoder().decode(result.stdout);
    if (
      result.exitCode !== 0 ||
      output.match(/\b\d+\.\d+\.\d+\b/)?.[0] !== resolved.ref.replace(/^v/, '')
    )
      throw new Error(
        `${tool} version failed: ${JSON.stringify(result)} ${output}`,
      );
    console.log(`${tool}: ${resolved.ref} ${resolved.commit} ${output.trim()}`);
  } finally {
    await session.dispose();
  }
}
