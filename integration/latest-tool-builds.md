# Latest stable tool builds

Pages resolves GitHub's latest stable release for every registered tool on each
daily run, site-changing push to main, and manual deployment. Source defaults
are `latest`; deployed defaults are concrete tags.

The reusable `build-latest-guests.yml` workflow resolves each tag and full commit
once, downloads the source archive for that commit, and compiles static musl
x86-64 guests. Pitchfork's UI uses the freshly built aube and Node 24.21.0. Its
guest sources are compiled without local patches. Pitchfork's musl ioctl fix is
already upstream in v2.30.1; no copy of the obsolete patch is needed.

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

New tools use the same release policy and must have a native builder and runtime
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

The local candidate used the verified RC archive's unchanged aube v2.7.0 binary
and the existing formicarium v2.30.1 native build with its recorded commit and UI metadata; the ioctl correction is already
part of that upstream source. Both passed Node execution and all six browser version/commit
checks. This checks assembly and runtime execution; the new Linux CI separately
builds both resolved commits from source.

Commands: `node scripts/check-latest-guests.mjs .vendor/site-latest` and
`playwright test --config playwright.latest.config.ts` with the candidate site
and bun paths explicitly set. Package CI passed 162 tests, type-check and build.
`mise run lint:all` passed. Existing three-browser suites passed: 34 legacy
checks (two existing skips) and 45 fixed-RC checks.
