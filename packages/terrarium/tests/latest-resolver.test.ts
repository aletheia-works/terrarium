import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dir, '../../..');
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
async function resolve(corruption?: 'guest' | 'patch') {
  const directory = await mkdtemp(path.join(tmpdir(), 'latest-resolver-'));
  const resolverRoot = path.join(
    process.env.FORMICARIUM_INPUTS_ROOT ??
      path.join(root, '.vendor/formicarium-inputs'),
    'resolver',
  );
  for (const name of ['manifest.js', 'fixtures.js', 'resolver.js'])
    await cp(path.join(resolverRoot, name), path.join(directory, name));
  await cp(
    path.join(root, 'scripts/latest-guest-resolver.mjs'),
    path.join(directory, 'latest-resolver.mjs'),
  );
  const guest = new Uint8Array(120);
  guest.set([127, 69, 76, 70, 2, 1, 1]);
  const header = new DataView(guest.buffer);
  header.setUint16(16, 2, true);
  header.setUint16(18, 62, true);
  header.setUint32(20, 1, true);
  header.setBigUint64(32, 64n, true);
  header.setUint16(52, 64, true);
  header.setUint16(54, 56, true);
  header.setUint16(56, 1, true);
  header.setUint32(64, 1, true);
  const source = {
    type: 'git-unmodified',
    url: 'https://github.com/jdx/pitchfork',
    ref: 'v2.30.1',
    commit: 'a'.repeat(40),
  };
  const info = {
    schemaVersion: 1,
    tool: 'pitchfork',
    ref: 'v2.30.1',
    built_at: '2026-10-10T00:00:00Z',
    source,
    target: 'x86_64-unknown-linux-musl',
    linkage: 'static',
    libc: 'musl',
    sourcePatches: [],
    ...(corruption === 'patch'
      ? {
          patch_sha256:
            '1e307ed8c3009ead22a08c5615fda5b30ac42cdc79726bbb722e10b5426dbac6',
        }
      : {}),
  };
  const infoBytes = json(info);
  const build = {
    ...info,
    guest: {
      url: 'dist/pitchfork/guest',
      sha256: sha(guest),
      format: 'static-musl-x86_64',
    },
    buildInfo: {
      url: 'dist/pitchfork/build-info.json',
      sha256: sha(infoBytes),
    },
    fixtures: {},
  };
  const files: Record<string, Uint8Array> = {
    '/web/tools.json': json({ pitchfork: { default: 'v2.30.1' } }),
    '/web/dist/builds.json': json({
      builds: { pitchfork: { 'v2.30.1': build } },
    }),
    '/web/dist/pitchfork/build-info.json': infoBytes,
    '/web/dist/pitchfork/guest':
      corruption === 'guest' ? Buffer.from('corrupted') : guest,
  };
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const bytes = files[new URL(request.url).pathname];
      return bytes
        ? new Response(new Uint8Array(bytes))
        : new Response('missing', { status: 404 });
    },
  });
  try {
    const { resolveGuest } = await import(
      pathToFileURL(path.join(directory, 'latest-resolver.mjs')).href
    );
    const result = await resolveGuest({
      base: `http://127.0.0.1:${server.port}/web/`,
      tool: 'pitchfork',
      ref: 'v2.30.1',
      fixture: '',
    });
    expect(result.guest).toEqual(guest);
    expect(result.build.source).toEqual(source);
    expect(result.entries).toEqual([]);
    expect(await readFile(path.join(directory, 'resolver.js'))).toEqual(
      await readFile(path.join(resolverRoot, 'resolver.js')),
    );
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}
test('latest resolver accepts unmodified pitchfork while retaining frozen validation helpers', () =>
  resolve());
test('latest resolver refuses a changed guest even with valid catalogue and provenance', () =>
  expect(resolve('guest')).rejects.toThrow('SHA-256 mismatch'));
test('latest resolver refuses fabricated patch provenance even with a valid asset hash', () =>
  expect(resolve('patch')).rejects.toThrow('must not claim a patch'));
