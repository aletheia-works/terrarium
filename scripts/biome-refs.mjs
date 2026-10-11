import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateUnmodifiedProvenance } from './latest-guest-resolver.mjs';
import { buildLatest, fixtureFiles } from './latest-guests.mjs';
import { validateBuild } from './latest-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};
const api = (endpoint) =>
  JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
export async function resolveBiomeRef(input, github = api) {
  const repo = input.repository;
  if (!/^[A-Za-z0-9_.-]+\/biome$/.test(repo ?? ''))
    throw new Error('invalid Biome repository');
  if (typeof input.ref !== 'string' || !input.ref.trim())
    throw new Error('Biome ref required');
  let ref = input.ref;
  let pr;
  const match = ref.match(/^pr-(\d+)$/);
  let commit;
  if (match) {
    const pull = await github(`repos/${repo}/pulls/${match[1]}`);
    ref = `refs/pull/${match[1]}/head`;
    commit = pull.head.sha;
    pr = `https://github.com/${repo}/pull/${match[1]}`;
  } else
    commit = (await github(`repos/${repo}/commits/${encodeURIComponent(ref)}`))
      .sha;
  if (!/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw new Error('invalid Biome commit');
  const name = input.name ?? `${repo.replace('/', '-')}-${commit.slice(0, 12)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
    throw new Error('invalid build name');
  const fixture = input.fixture ?? 'biome-basic';
  if (!['biome-basic', 'biome-migrate-prettier'].includes(fixture))
    throw new Error('invalid Biome fixture');
  return { ...input, repo, ref, commit, name, fixture, ...(pr && { pr }) };
}
export async function stageBiomeRef(resolved, binaries, site, resolver) {
  const guest = await readFile(path.join(binaries, 'biome'));
  const info = await readFile(path.join(binaries, 'biome.json'));
  const provenance = JSON.parse(info);
  const { validateGuestElf } = await import(
    pathToFileURL(path.join(resolver, 'resolver.js')).href
  );
  validateGuestElf(guest);
  if (
    provenance.source?.url !== `https://github.com/${resolved.repo}` ||
    provenance.source?.ref !== resolved.ref ||
    provenance.source?.commit !== resolved.commit
  )
    throw new Error('Biome source identity mismatch');
  const fixture = Buffer.from(
    `${JSON.stringify(
      await fixtureFiles(path.join(root, 'fixtures', resolved.fixture)),
    )}\n`,
  );
  // Hash the actual published metadata, including the selection name.
  const adapted = { ...provenance, ref: resolved.name };
  const adaptedInfo = Buffer.from(`${JSON.stringify(adapted)}\n`);
  const dir = `dist/biome/${sha(Buffer.concat([guest, adaptedInfo, fixture]))}`;
  const asset = (name, bytes) => ({
    url: `${dir}/${name}`,
    sha256: sha(bytes),
  });
  const build = {
    schemaVersion: 1,
    tool: 'biome',
    ref: resolved.name,
    source: provenance.source,
    built_at: provenance.built_at,
    guest: { ...asset('guest', guest), format: 'static-musl-x86_64' },
    buildInfo: asset('build-info.json', adaptedInfo),
    fixtures: { [resolved.fixture]: asset('fixture.json', fixture) },
    upstream_pr: resolved.pr ?? null,
  };
  validateBuild(build, {
    tool: 'biome',
    ref: resolved.name,
    base: 'https://stage.invalid/web/',
  });
  validateUnmodifiedProvenance(adapted, build);
  await mkdir(path.join(site, dir), { recursive: true });
  for (const [name, bytes] of [
    ['guest', guest],
    ['build-info.json', adaptedInfo],
    ['fixture.json', fixture],
  ])
    await writeFile(path.join(site, dir, name), bytes);
  const catalogue = await json(path.join(site, 'dist/builds.json'));
  if (
    catalogue.builds.biome[resolved.name]?.source?.commit &&
    catalogue.builds.biome[resolved.name].source.url !== build.source.url
  )
    throw new Error('Biome build name repository collision');
  catalogue.builds.biome[resolved.name] = build;
  await save(path.join(site, 'dist/builds.json'), catalogue);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [configFile, binaries, site, resolver] = process.argv.slice(2);
  if (!configFile || !binaries || !site || !resolver)
    throw new Error(
      'usage: biome-refs.mjs <config> <binaries> <latest-site> <resolver>',
    );
  const config = await json(configFile);
  const refs = [];
  if (process.env.BIOME_REF)
    config.refs.push({
      repository: process.env.BIOME_REPOSITORY || 'biomejs/biome',
      ref: process.env.BIOME_REF,
    });
  const names = new Set();
  for (const input of config.refs) {
    const resolved = await resolveBiomeRef(input);
    if (names.has(resolved.name)) throw new Error('duplicate Biome build name');
    names.add(resolved.name);
    const out = path.resolve(binaries, resolved.name);
    await buildLatest(
      { schemaVersion: 1, tools: { biome: resolved } },
      out,
      path.resolve(resolver),
    );
    await stageBiomeRef(
      resolved,
      out,
      path.resolve(site),
      path.resolve(resolver),
    );
    refs.push(resolved);
  }
  await save(path.join(site, 'biome-ref-resolutions.json'), { refs });
}
