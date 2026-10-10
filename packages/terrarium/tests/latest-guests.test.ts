import { expect, test } from 'bun:test';
import {
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
