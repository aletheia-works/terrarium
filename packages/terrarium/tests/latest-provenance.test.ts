import { expect, test } from 'bun:test';
import { validateUnmodifiedProvenance } from '../../../scripts/latest-guest-resolver.mjs';

const build = {
  tool: 'pitchfork',
  ref: 'v2.30.1',
  built_at: '2026-10-10T00:00:00Z',
  source: {
    type: 'git-unmodified',
    url: 'https://github.com/jdx/pitchfork',
    ref: 'v2.30.1',
    commit: 'a'.repeat(40),
  },
};
const info = {
  ...build,
  schemaVersion: 1,
  target: 'x86_64-unknown-linux-musl',
  linkage: 'static',
  libc: 'musl',
  sourcePatches: [],
};
test('latest upstream pitchfork needs no local ioctl patch or fabricated patch digest', () => {
  expect(validateUnmodifiedProvenance(info, build)).toBe(info);
});
for (const [name, change] of Object.entries({
  'fabricated legacy patch digest': {
    patch_sha256:
      '1e307ed8c3009ead22a08c5615fda5b30ac42cdc79726bbb722e10b5426dbac6',
  },
  'local source patch': { sourcePatches: ['ioctl.patch'] },
  'missing patch declaration': { sourcePatches: undefined },
  'different source commit': {
    source: { ...build.source, commit: 'b'.repeat(40) },
  },
  'different tool': { tool: 'aube' },
  'dynamic binary': { linkage: 'dynamic' },
  'wrong target': { target: 'x86_64-unknown-linux-gnu' },
})) {
  test(`latest provenance rejects ${name}`, () => {
    expect(() =>
      validateUnmodifiedProvenance({ ...info, ...change }, build),
    ).toThrow();
  });
}
