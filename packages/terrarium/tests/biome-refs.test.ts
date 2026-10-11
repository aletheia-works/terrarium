import { expect, test } from 'bun:test';
import { resolveBiomeRef } from '../../../scripts/biome-refs.mjs';

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
