import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const save = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
};
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options });
const github = (endpoint) =>
  JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));

/** Resolve every registered tool once; the resulting commits are build inputs. */
export async function resolveLatest(tools, api = github) {
  const resolutions = {};
  for (const [tool, config] of Object.entries(tools)) {
    if (!/^[a-z][a-z0-9-]*$/.test(tool)) throw new Error('invalid tool name');
    const repo = config.repository?.match(
      /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/,
    )?.[1];
    if (!repo) throw new Error(`invalid repository: ${tool}`);
    const release = await api(`repos/${repo}/releases/latest`);
    const ref = release.tag_name;
    if (release.draft || release.prerelease || !/^v?\d+\.\d+\.\d+$/.test(ref))
      throw new Error(`invalid latest stable release: ${tool}`);
    const { sha: commit } = await api(`repos/${repo}/commits/${ref}`);
    if (!/^[0-9a-f]{40}$/.test(commit))
      throw new Error('invalid source commit');
    resolutions[tool] = { repo, ref, commit };
  }
  if (!Object.keys(resolutions).length) throw new Error('no registered tools');
  return { schemaVersion: 1, tools: resolutions };
}

/** Reject an old catalogue even if its assets and provenance are valid. */
export function validateLatest(tools, builds, resolutions, registered) {
  const wanted = Object.keys(registered).sort();
  if (
    resolutions.schemaVersion !== 1 ||
    JSON.stringify(Object.keys(resolutions.tools).sort()) !==
      JSON.stringify(wanted) ||
    JSON.stringify(Object.keys(tools).sort()) !== JSON.stringify(wanted) ||
    JSON.stringify(Object.keys(builds.builds).sort()) !== JSON.stringify(wanted)
  )
    throw new Error('latest tool coverage mismatch');
  for (const tool of wanted) {
    const { repo, ref, commit } = resolutions.tools[tool];
    const build = builds.builds[tool]?.[ref];
    if (
      !/^v?\d+\.\d+\.\d+$/.test(ref) ||
      !/^[0-9a-f]{40}$/.test(commit) ||
      registered[tool].repository !== `https://github.com/${repo}` ||
      tools[tool].repository !== registered[tool].repository ||
      tools[tool].default !== ref ||
      build?.ref !== ref ||
      build?.source?.ref !== ref ||
      build?.source?.commit !== commit ||
      build?.source?.url !== registered[tool].repository
    )
      throw new Error(`latest source mismatch: ${tool}`);
  }
}

async function fixtureFiles(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      Object.assign(
        result,
        await fixtureFiles(path.join(directory, entry.name), `${relative}/`),
      );
    else if (entry.isFile())
      result[relative] = await readFile(
        path.join(directory, entry.name),
        'utf8',
      );
    else throw new Error(`unsupported fixture entry: ${relative}`);
  }
  return result;
}

export async function stageLatest({
  resolutions,
  binaries,
  destination,
  resolverRoot,
}) {
  const registered = await load(path.join(root, 'web/tools.json'));
  const { validateGuestElf, validateProvenance } = await import(
    pathToFileURL(path.join(resolverRoot, 'resolver.js')).href
  );
  const { validateBuild } = await import(
    pathToFileURL(path.join(resolverRoot, 'manifest.js')).href
  );
  const tools = {};
  const builds = { builds: {} };
  for (const [tool, config] of Object.entries(registered)) {
    const resolved = resolutions.tools[tool];
    if (!resolved) throw new Error(`missing resolution: ${tool}`);
    const guest = await readFile(path.join(binaries, tool));
    validateGuestElf(guest);
    const info = await readFile(path.join(binaries, `${tool}.json`));
    const provenance = JSON.parse(info);
    const fixture = Buffer.from(
      `${JSON.stringify(await fixtureFiles(path.join(root, 'fixtures', config.fixture)), null, 2)}\n`,
    );
    const directory = `dist/${tool}/${hash(Buffer.concat([guest, info, fixture]))}`;
    const asset = (name, bytes) => ({
      url: `${directory}/${name}`,
      sha256: hash(bytes),
    });
    const build = {
      schemaVersion: 1,
      tool,
      ref: resolved.ref,
      source: {
        url: config.repository,
        ref: resolved.ref,
        commit: resolved.commit,
      },
      built_at: provenance.built_at,
      guest: { ...asset('guest', guest), format: 'static-musl-x86_64' },
      buildInfo: asset('build-info.json', info),
      fixtures: { [config.fixture]: asset('fixture.json', fixture) },
    };
    validateBuild(build, {
      tool,
      ref: resolved.ref,
      base: 'https://stage.invalid/web/',
    });
    validateProvenance(provenance, build);
    tools[tool] = { ...config, default: resolved.ref };
    builds.builds[tool] = { [resolved.ref]: build };
    await mkdir(path.join(destination, directory), { recursive: true });
    for (const [name, bytes] of [
      ['guest', guest],
      ['build-info.json', info],
      ['fixture.json', fixture],
    ])
      await writeFile(path.join(destination, directory, name), bytes);
  }
  validateLatest(tools, builds, resolutions, registered);
  await save(path.join(destination, 'tools.json'), tools);
  await save(path.join(destination, 'dist/builds.json'), builds);
  await save(path.join(destination, 'latest-resolutions.json'), resolutions);
}

async function buildLatest(resolutions, destination) {
  // Builders are explicit; adding a registered tool without one fails the run.
  for (const tool of Object.keys(resolutions.tools)) {
    if (!['aube', 'pitchfork'].includes(tool))
      throw new Error(`no native guest builder: ${tool}`);
  }
  run('mise', ['install', 'node@24.21.0'], { cwd: root });
  await mkdir(destination, { recursive: true });
  for (const tool of ['aube', 'pitchfork'].filter(
    (tool) => resolutions.tools[tool],
  )) {
    const resolved = resolutions.tools[tool];
    const source = path.join(destination, `source-${tool}-${resolved.commit}`);
    await mkdir(source, { recursive: true });
    const archive = path.join(destination, `${tool}.tar.gz`);
    run('curl', [
      '--fail',
      '--location',
      '--retry',
      '3',
      `https://codeload.github.com/${resolved.repo}/tar.gz/${resolved.commit}`,
      '-o',
      archive,
    ]);
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', source]);
    run('bash', [
      path.join(root, 'scripts/build-native-guest.sh'),
      tool,
      source,
      destination,
    ]);
    const info = {
      schemaVersion: 1,
      tool,
      ref: resolved.ref,
      source: {
        url: `https://github.com/${resolved.repo}`,
        ref: resolved.ref,
        commit: resolved.commit,
      },
      built_at: new Date().toISOString(),
      target: 'x86_64-unknown-linux-musl',
      linkage: 'static',
      libc: 'musl',
      rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    };
    if (tool === 'pitchfork') {
      info.patch_sha256 = hash(
        await readFile(
          path.join(root, 'patches/guests/pitchfork-musl-ioctl.patch'),
        ),
      );
      info.ui_node = execFileSync(
        'mise',
        ['exec', 'node@24.21.0', '--', 'node', '--version'],
        { encoding: 'utf8' },
      ).trim();
      info.ui_index_sha256 = hash(
        await readFile(path.join(source, 'ui/dist/index.html')),
      );
    }
    await save(path.join(destination, `${tool}.json`), info);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [verb, filename, destination, resolverRoot] = process.argv.slice(2);
  if (verb === 'resolve' && filename)
    await save(
      filename,
      await resolveLatest(await load(path.join(root, 'web/tools.json'))),
    );
  else if (verb === 'build' && filename && destination)
    await buildLatest(await load(filename), path.resolve(destination));
  else if (verb === 'stage' && filename && destination && resolverRoot)
    await stageLatest({
      resolutions: await load(filename),
      binaries: path.dirname(path.resolve(filename)),
      destination: path.resolve(destination),
      resolverRoot: path.resolve(resolverRoot),
    });
  else
    throw new Error(
      'usage: latest-guests.mjs resolve <resolutions.json> | build <resolutions.json> <binaries> | stage <binaries/resolutions.json> <site> <resolver>',
    );
}
