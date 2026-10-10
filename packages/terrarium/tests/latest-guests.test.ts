import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  releaseBinary,
  resolveLatest,
  validateLatest,
} from '../../../scripts/latest-guests.mjs';

const registered = {
  aube: { repository: 'https://github.com/aubepkg/aube', default: 'old' },
  pitchfork: { repository: 'https://github.com/jdx/pitchfork', default: 'old' },
  future: { repository: 'https://github.com/owner/future', default: 'old' },
};
const commit = 'a'.repeat(40);
const api = (version: string) => async (endpoint: string) =>
  endpoint.endsWith('/releases/latest')
    ? { tag_name: version, draft: false, prerelease: false }
    : { sha: commit };

test('every registered tool resolves its current stable release, ignoring stale defaults', async () => {
  const before = await resolveLatest(registered, api('v1.0.0'));
  const after = await resolveLatest(registered, api('v1.0.1'));
  expect(Object.keys(after.tools)).toEqual(Object.keys(registered));
  expect(after.tools.future!.ref).toBe('v1.0.1');
  expect(after).not.toEqual(before);
});
test('missing release and prerelease fail rather than reuse an old build', async () => {
  await expect(
    resolveLatest(registered, async () => ({
      tag_name: 'v1.0.0',
      prerelease: true,
    })),
  ).rejects.toThrow('invalid latest');
  await expect(
    resolveLatest(registered, async () => {
      throw new Error('unavailable');
    }),
  ).rejects.toThrow('unavailable');
});
test('a valid frozen catalogue cannot override the newly resolved release or commit', async () => {
  const resolutions = await resolveLatest(registered, api('v1.0.1'));
  const tools = Object.fromEntries(
    Object.entries(registered).map(([tool, config]) => [
      tool,
      { ...config, default: 'v1.0.1' },
    ]),
  );
  const builds = {
    builds: Object.fromEntries(
      Object.entries(registered).map(([tool, config]) => [
        tool,
        {
          'v1.0.1': {
            ref: 'v1.0.1',
            source: { url: config.repository, ref: 'v1.0.1', commit },
          },
        },
      ]),
    ),
  };
  expect(() =>
    validateLatest(tools, builds, resolutions, registered),
  ).not.toThrow();
  tools.pitchfork!.default = 'v1.0.0';
  expect(() => validateLatest(tools, builds, resolutions, registered)).toThrow(
    'latest source mismatch',
  );
  tools.pitchfork!.default = 'v1.0.1';
  builds.builds.pitchfork!['v1.0.1']!.source.commit = 'b'.repeat(40);
  expect(() => validateLatest(tools, builds, resolutions, registered)).toThrow(
    'latest source mismatch',
  );
});
test('omitting a registered tool fails instead of serving the remaining stale catalogue', async () => {
  const resolutions = await resolveLatest(registered, api('v1.0.1'));
  delete resolutions.tools.future;
  expect(() =>
    validateLatest({}, { builds: {} }, resolutions, registered),
  ).toThrow('coverage mismatch');
});

const officialAsset = {
  name: 'aube-v1.0.0-x86_64-unknown-linux-musl.tar.gz',
  browser_download_url:
    'https://github.com/aubepkg/aube/releases/download/v1.0.0/aube-v1.0.0-x86_64-unknown-linux-musl.tar.gz',
  digest: `sha256:${'b'.repeat(64)}`,
  size: 1024,
};
const releaseApi = (assets: unknown[]) => async (endpoint: string) =>
  endpoint.endsWith('/releases/latest')
    ? { tag_name: 'v1.0.0', assets }
    : { sha: commit };

test('prefer the official musl archive and ignore incompatible GNU assets', async () => {
  const resolutions = await resolveLatest(
    registered,
    releaseApi([officialAsset]),
  );
  expect(resolutions.tools.aube!.releaseAsset?.sha256).toBe('b'.repeat(64));
  expect(resolutions.tools.pitchfork!.releaseAsset).toBeUndefined();
  const gnu = {
    ...officialAsset,
    name: 'aube-v1.0.0-x86_64-unknown-linux-gnu.tar.gz',
  };
  expect(
    (await resolveLatest(registered, releaseApi([gnu]))).tools.aube!
      .releaseAsset,
  ).toBeUndefined();
});
test('a matching official asset with missing digest or wrong origin fails closed', async () => {
  for (const asset of [
    { ...officialAsset, digest: null },
    {
      ...officialAsset,
      browser_download_url: 'https://example.com/aube.tar.gz',
    },
  ])
    await expect(
      resolveLatest(registered, releaseApi([asset])),
    ).rejects.toThrow('invalid release asset identity');
});
test('release archive integrity and executable identity are checked before use', () => {
  const header = Buffer.alloc(512);
  header.write('aube');
  header.write('00000000000\0', 124);
  header.write('0', 156);
  header.fill(32, 148, 156);
  header.write(
    `${header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0')}\0 `,
    148,
  );
  const archive = gzipSync(Buffer.concat([header, Buffer.alloc(1024)]));
  const asset = {
    name: officialAsset.name,
    url: officialAsset.browser_download_url,
    sha256: createHash('sha256').update(archive).digest('hex'),
    size: archive.length,
  };
  expect(releaseBinary(archive, 'aube', asset).length).toBe(0);
  expect(() =>
    releaseBinary(archive, 'aube', { ...asset, sha256: '0'.repeat(64) }),
  ).toThrow('digest/size mismatch');
  expect(() => releaseBinary(archive, 'pitchfork', asset)).toThrow(
    'expected one release executable',
  );
});

test('official companion symlinks are omitted, never used as the guest', () => {
  const entry = (name: string, type: string) => {
    const header = Buffer.alloc(512);
    header.write(name);
    header.write('00000000000\0', 124);
    header.write(type, 156);
    header.write('aube', 157);
    header.fill(32, 148, 156);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    return header;
  };
  const archive = gzipSync(
    Buffer.concat([entry('aube', '0'), entry('aubr', '2'), Buffer.alloc(1024)]),
  );
  const asset = {
    name: officialAsset.name,
    url: officialAsset.browser_download_url,
    sha256: createHash('sha256').update(archive).digest('hex'),
    size: archive.length,
  };
  expect(releaseBinary(archive, 'aube', asset).length).toBe(0);
  expect(() => releaseBinary(archive, 'aubr', asset)).toThrow(
    'expected one release executable',
  );
});

test('Biome resolves its scoped release tag and verified standalone musl binary', async () => {
  const bytes = Buffer.from('official binary');
  const asset = {
    name: 'biome-linux-x64-musl',
    browser_download_url:
      'https://github.com/biomejs/biome/releases/download/%40biomejs%2Fbiome%402.5.15/biome-linux-x64-musl',
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    size: bytes.length,
  };
  const result = await resolveLatest(
    { biome: { repository: 'https://github.com/biomejs/biome' } },
    async (endpoint: string) =>
      endpoint.endsWith('/releases/latest')
        ? { tag_name: '@biomejs/biome@2.5.15', assets: [asset] }
        : { sha: commit },
  );
  const resolved = result.tools.biome!;
  expect(resolved.ref).toBe('@biomejs/biome@2.5.15');
  expect(resolved.releaseAsset?.format).toBe('binary');
  expect(releaseBinary(bytes, 'biome', resolved.releaseAsset!)).toEqual(bytes);
  expect(() =>
    releaseBinary(Buffer.from('tampered'), 'biome', resolved.releaseAsset!),
  ).toThrow('digest/size mismatch');
});
