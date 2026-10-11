# Operational tasks

Run `mise tasks --local` to list the task entrypoints. Shell entrypoints live in
`mise-tasks/`; their directory names become colon-separated task names, without
an extra declaration in `mise.toml`.

| Task | Purpose |
| ---- | ------- |
| `build:resolve <tool> <ref>` | Resolve a branch, release, commit or PR to a source identity |
| `build:aube <source> <output>` | Build the legacy Emscripten aube guest |
| `build:pitchfork <source> <output>` | Build the legacy Emscripten pitchfork guest |
| `build:native <tool> <source> <output>` | Build a native guest for formicarium |
| `build:fetch <ref>...` | Fetch published legacy aube builds |
| `build:load` | Load the published builds branch |
| `web:stage [tool ref output]` | Stage guest files and build metadata |
| `site:build [output] [mode]` | Assemble the site; defaults to `.site` and formicarium |
| `terrarium:prepare [input options]` | Verify fixed inputs and fetch the pinned npm RC |
| `ci:terrarium` | Install, type-check, unit-test and build the package |
| `ci:pitchfork-prepare` | Verify and stage the selected legacy pitchfork build |
| `ci:e2e` | Run the legacy and formicarium suites in three browsers |

For local CI tasks, set `FORMICARIUM_INPUTS_DIR` to the fixed-input bundle.
`ci:e2e` also requires a build matching the resolved pitchfork release; supply
`TERRARIUM_PITCHFORK_BUILD`, `TERRARIUM_PITCHFORK_REF` and
`TERRARIUM_PITCHFORK_COMMIT` to reuse a known build. Preparation verifies input
integrity and the RC tarball before the frozen dependency installation.

Simple commands and task dependencies remain in `mise.toml`. Shared, tested
JavaScript logic stays in `scripts/`, as do shared shell build helpers such as
`emscripten-env.sh`, `patch-rust-src.sh` and `vendor-patched.sh`. These are
implementation details rather than additional task entrypoints.

GitHub Actions owns matrices, artifact transfer, permissions and deployment.
It can invoke these same task files directly after setting up its tools. This
keeps local operations reproducible without adding wrapper scripts for CI.
The native and legacy suites exercise different runtimes and remain separate.

The unused `check-pitchfork-runtime.mjs` checker, tied to `v2.29.0`, has been
removed. The maintained Playwright suites cover CLI commands, disk persistence,
tool switching, custom elements and iframe integration. Historical AI-DLC
records still describe the old acceptance run.
