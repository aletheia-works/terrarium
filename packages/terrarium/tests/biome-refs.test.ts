import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveBiomeRef,
  stageBiomeRef,
} from '../../../scripts/biome-refs.mjs';

const commit = 'a'.repeat(40);
test('fork branches and commits resolve without changing source identity', async () => {
  for (const ref of ['fix/migrate-prettier-default-semi-quotes', commit]) {
    const result = await resolveBiomeRef(
      { repository: 'JamBalaya56562/biome', ref },
      async (endpoint) => {
        expect(endpoint).toBe(
          `repos/JamBalaya56562/biome/commits/${encodeURIComponent(ref)}`,
        );
        return { sha: commit };
      },
    );
    expect(result).toMatchObject({ repo: 'JamBalaya56562/biome', ref, commit });
  }
});
test('PR source resolves its head in the requested repository', async () => {
  const result = await resolveBiomeRef(
    { repository: 'biomejs/biome', ref: 'pr-123' },
    async (endpoint) => {
      expect(endpoint).toBe('repos/biomejs/biome/pulls/123');
      return { head: { sha: commit } };
    },
  );
  expect(result).toMatchObject({
    ref: 'refs/pull/123/head',
    commit,
    pr: 'https://github.com/biomejs/biome/pull/123',
  });
});
test('unsafe repositories, labels and invalid commits fail before build', async () => {
  for (const input of [
    { repository: '../biome', ref: 'main' },
    { repository: 'biomejs/biome', ref: 'main', name: '../bad' },
    { repository: 'biomejs/biome', ref: '' },
  ])
    await expect(
      resolveBiomeRef(input, async () => ({ sha: commit })),
    ).rejects.toThrow();
  await expect(
    resolveBiomeRef({ repository: 'biomejs/biome', ref: 'main' }, async () => ({
      sha: 'invalid',
    })),
  ).rejects.toThrow('invalid Biome commit');
});

test('two selection names keep independent immutable metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'biome-alias-'));
  try {
    const guest = Buffer.alloc(120);
    guest.set([127, 69, 76, 70, 2, 1, 1]);
    guest.writeUInt16LE(2, 16);
    guest.writeUInt16LE(62, 18);
    guest.writeUInt32LE(1, 20);
    guest.writeBigUInt64LE(64n, 32);
    guest.writeUInt16LE(64, 52);
    guest.writeUInt16LE(56, 54);
    guest.writeUInt16LE(1, 56);
    guest.writeUInt32LE(1, 64);
    const source = {
      type: 'git-unmodified',
      url: 'https://github.com/biomejs/biome',
      ref: 'main',
      commit,
    };
    await writeFile(path.join(directory, 'biome'), guest);
    await writeFile(
      path.join(directory, 'biome.json'),
      JSON.stringify({
        schemaVersion: 1,
        tool: 'biome',
        ref: 'main',
        source,
        built_at: '2026-10-10T00:00:00Z',
        target: 'x86_64-unknown-linux-musl',
        linkage: 'static',
        libc: 'musl',
        sourcePatches: [],
      }),
    );
    await mkdir(path.join(directory, 'dist'));
    await writeFile(
      path.join(directory, 'dist/builds.json'),
      JSON.stringify({ builds: { biome: {} } }),
    );
    const resolver = path.resolve(
      import.meta.dir,
      '../../../.vendor/formicarium-inputs/resolver',
    );
    for (const name of ['first', 'second']) {
      const resolved = await resolveBiomeRef(
        {
          repository: 'biomejs/biome',
          ref: 'main',
          name,
          fixture: 'biome-migrate-prettier',
        },
        async () => ({ sha: commit }),
      );
      await stageBiomeRef(resolved, directory, directory, resolver);
    }
    const catalogue = JSON.parse(
      await readFile(path.join(directory, 'dist/builds.json'), 'utf8'),
    );
    const builds = catalogue.builds.biome;
    expect(Object.keys(builds.first.fixtures).sort()).toEqual([
      'biome-basic',
      'biome-migrate-prettier',
    ]);
    expect(builds.first.buildInfo.url).not.toBe(builds.second.buildInfo.url);
    for (const name of ['first', 'second']) {
      const bytes = await readFile(
        path.join(directory, builds[name].buildInfo.url),
      );
      expect(JSON.parse(bytes.toString()).ref).toBe(name);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        builds[name].buildInfo.sha256,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
