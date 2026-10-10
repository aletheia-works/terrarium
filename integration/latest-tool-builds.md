# Latest stable tool builds

Pages resolves GitHub's latest stable release for every registered tool on each
daily run, site-changing push to main, and manual deployment. Source defaults
are `latest`; deployed defaults are concrete tags.

The reusable `build-latest-guests.yml` workflow resolves each tag and full commit
once. It prefers the official x86-64 static musl release archive, verifies its
publisher SHA256 and size, extracts its executable without following archive
links, and validates the ELF before use. It records the release URL and archive
digest; the source commit identifies the release tag, not a reproducibility
attestation for the publisher's binary.

Aube v2.7.0 uses its official musl binary without a source build. Pitchfork
v2.30.1 only publishes a dynamically linked glibc Linux binary, so terrarium
compiles the resolved upstream commit to static musl without local patches.
Its UI uses the official aube binary and Node 24.21.0. Cargo and rustc come from
terrarium's pinned mise installation, bypassing upstream contributor wrappers.
Build-time mise executions name Rust or Node explicitly and disable automatic
installation (`MISE_AUTO_INSTALL=0`). The setup step installs bun/node/rust, and
the UI Node version is installed explicitly. This prevents compiler discovery
from installing unrelated lint/OpenTofu tools or consuming anonymous GitHub API
quota. Latest release resolution still uses the authenticated `GH_TOKEN` step.
The musl ioctl fix is already upstream; no obsolete patch is needed.

Before publishing the guest catalogue, the workflow executes each guest's
`--version` command in Node, Chromium, Firefox, and WebKit. Browser tests also
verify the selected tag and source commit. Failed resolution, compilation or
acceptance prevents deployment and leaves the previous deployed site available.

`TERRARIUM_GUEST_SITE` selects the generated catalogue during assembly. All
registered tools must match the resolved repositories, tags and commits.
Assembly validates asset digests, ELF format and provenance before switching the
candidate. Fixed RC inputs still supply the pinned runtime and validation helpers. Latest
guests use terrarium's resolver with explicit `git-unmodified` source identity
and an empty `sourcePatches` list, instead of the frozen resolver's historical
pitchfork patch-SHA requirement. The fixed acceptance resolver stays unchanged. Their
historical guest defaults cannot override this generated catalogue. Without the
variable, fixed RC acceptance retains its recorded versions.

New tools use the same release policy and must have a compatible official asset or native builder, plus runtime
support before registration. Missing builders or unsupported guests stop the
run. A tool without stable GitHub releases requires an agreed alternative policy.
Manual ref builds still produce legacy Emscripten assets; they do not replace the
public native catalogue.

## Local reproduction

Linux x86-64 needs mise, musl-tools, make, CMake and Perl. Prepare the pinned RC
inputs and package dependencies through the normal input workflow, then run:

```sh
mise install
mise exec -- node scripts/latest-guests.mjs resolve .vendor/native/resolutions.json
mise exec -- node scripts/latest-guests.mjs build .vendor/native/resolutions.json .vendor/native
mise exec -- node scripts/latest-guests.mjs stage .vendor/native/resolutions.json .vendor/latest-guests .vendor/formicarium-inputs/resolver
TERRARIUM_GUEST_SITE=.vendor/latest-guests mise run site:build
mise exec -- node scripts/check-latest-guests.mjs .site
cd packages/terrarium
TERRARIUM_BUN=$(mise which bun) TERRARIUM_SITE_DIR=$(pwd)/../../.site mise exec -- bun x playwright test --config playwright.latest.config.ts
```

## Local acceptance, 2026-10-10

The GitHub resolver returned aube v2.7.0 at
`d36fec01764689ef6d99a5e43de98925b571d67f` and pitchfork v2.30.1 at
`1054549e85470b08d9507e2c82c850959a4b3914`.

The local candidate uses the official aube release archive:
`aube-v2.7.0-x86_64-unknown-linux-musl.tar.gz`, SHA256
`fc2384d58c560415f6afdfdc7c0f2d10b10f464da608bf1d8be5c8936db68666`.
Pitchfork uses the existing unmodified native build of the resolved source for
local Mac execution checks; Linux CI builds that commit with pinned Rust.
Both passed Node execution and all six browser version/commit checks
(Chromium, Firefox and WebKit; 12.7 seconds). Package CI passed type-check,
166 tests / 612 assertions and build. `mise run lint:all` passed.

Commands: `node scripts/check-latest-guests.mjs .vendor/site-latest` and
`playwright test --config playwright.latest.config.ts` with the candidate site
and bun paths explicitly set. The PR's latest-guests workflow additionally
checks the fresh Linux source build before accepting its catalogue.

## Emscripten E2E inputs

Emscripten E2E resolves the latest stable aube and pitchfork tags and commits once
per run, builds those source commits with the PR's runtime/patches/toolchain,
and shares same-run artifacts across all three browsers. Cache keys include
source commits and build inputs; cache misses rebuild rather than fetching the
production Pages catalogue. Tests retain page/element/iframe, fixture, event
and tool-switch behavior assertions, while version/source expectations come
from the resolved identities. New releases need no hardcoded test version edits.
Native latest-guests acceptance remains independent and covers production guests.
