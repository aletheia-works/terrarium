const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Latest guests compile upstream source without local source patches. */
export function validateUnmodifiedProvenance(info, build) {
  if (
    !record(info) ||
    info.schemaVersion !== 1 ||
    info.tool !== build.tool ||
    info.ref !== build.ref ||
    info.built_at !== build.built_at
  )
    throw new Error('build-info: schema/tool/ref/time mismatch');
  if (
    !record(info.source) ||
    info.source.type !== 'git-unmodified' ||
    build.source.type !== 'git-unmodified'
  )
    throw new Error('build-info: unmodified upstream source required');
  for (const field of ['url', 'ref', 'commit'])
    if (info.source[field] !== build.source[field])
      throw new Error('build-info: source identity mismatch');
  if (
    !['x86_64-linux-musl', 'x86_64-unknown-linux-musl'].includes(info.target) ||
    info.linkage !== 'static' ||
    info.libc !== 'musl'
  )
    throw new Error('build-info: static musl target provenance required');
  if (
    !Array.isArray(info.sourcePatches) ||
    info.sourcePatches.length !== 0 ||
    Object.hasOwn(info, 'patch_sha256')
  )
    throw new Error('build-info: unmodified source must not claim a patch');
  return info;
}

/** Reuse the pinned URL, catalogue, fixture and ELF checks with current provenance. */
export async function resolveGuest(input) {
  const [manifest, fixtures, elf] = await Promise.all([
    import('./latest-manifest.js'),
    import('./fixtures.js'),
    import('./resolver.js'),
  ]);
  if (!record(input)) throw new Error('selection: expected object');
  const base = manifest.normalizeBase(input.base);
  const fetchBytes = async (url, target) => {
    const response = await fetch(url, { redirect: 'error' });
    manifest.assertResponseUrl(response, url, base, target);
    if (!response.ok) throw new Error(`${target}: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const json = (bytes) =>
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const asset = async (entry, target) => {
    const bytes = await fetchBytes(
      manifest.resolveAssetUrl(entry.url, base, target),
      target,
    );
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hex = [...digest]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (hex !== entry.sha256) throw new Error(`${target}: SHA-256 mismatch`);
    return bytes;
  };
  const tools = json(
    await fetchBytes(manifest.resolveAssetUrl('tools.json', base), 'tools'),
  );
  const catalogue = json(
    await fetchBytes(
      manifest.resolveAssetUrl('dist/builds.json', base),
      'catalogue',
    ),
  );
  const choice = manifest.selectBuild(
    { tools, builds: catalogue.builds },
    { ...input, base },
  );
  const build = structuredClone(choice.build);
  const fixture = fixtures.selectFixture(
    choice.tool,
    input.fixture,
    build.fixtures,
  );
  validateUnmodifiedProvenance(
    json(await asset(build.buildInfo, 'build-info')),
    build,
  );
  const guest = elf.validateGuestElf(await asset(build.guest, 'guest'));
  const entries = fixture.name
    ? fixtures.convertFixture(
        json(await asset(build.fixtures[fixture.name], 'fixture')),
        { cwd: fixture.cwd },
      )
    : [];
  return { build, guest, entries, cwd: fixture.cwd };
}
