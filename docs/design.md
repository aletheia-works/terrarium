# terrarium — design

Status: draft. Decisions below were made in the design discussion;
everything under [Open questions](#open-questions) is still open and
should be settled by measurement, not argument.

## Goal

Run a specific CLI tool in the browser from a terminal, with its real
output, so that a bug in that tool can be reproduced as the session a
user would actually type.

First target: **aube** (a Node.js package manager written in Rust).
First milestone: an offline `aube install` / `aube list` of a project
whose dependencies are all local (`file:` and `link:`), which is enough
to reproduce aubepkg/aube#1645 and #1643.

## Decisions

- **Runs entirely in the browser.** No server executes anything. A
  reader who opens the page is running the tool on their own machine.
- **One tool, not a distribution.** terrarium is not a Linux in the
  browser. There is no general shell and no arbitrary binaries. The
  terminal accepts the target CLI plus a handful of built-in commands a
  reproduction needs (`ls`, `cat`, `rm -rf`, `cd`), implemented by the
  terminal itself.
- **No emulator, no kernel.** The CLI is compiled to WebAssembly from
  source. terrarium provides the system calls it makes, and nothing
  more. This is the opposite trade-off from WebVM (an x86 JIT plus a
  Linux syscall layer for unmodified binaries) and container2wasm (a
  full-system CPU emulator booting a kernel).
- **Its own repository**, separate from Vivarium. Vivarium consumes it
  for terminal-style reproduction pages.

## Non-goals (for now)

- Network access. Registry fetches, TLS, and DNS are out of the first
  milestone; the CLI gets an error if it tries.
- Running Node.js, and therefore lifecycle scripts (`postinstall` etc.).
- Tools other than aube. The second tool is chosen after the first one
  works, and will show which parts of the runtime generalise.

## What aube needs from the platform

`cargo check --target wasm32-wasip1 -p aube --bin aube
--no-default-features` on aube v2.6.1 fails in these crates:

| Crate | Needs | Kind |
| ----- | ----- | ---- |
| `tokio` (`full` features) | threads, sockets, processes, file I/O | platform |
| `socket2` | sockets | platform |
| `fslock` | file locking | platform |
| `signal-hook-registry` | signals | platform |
| `aws-lc-sys` | TLS (C library) | C code |
| `libz-ng-sys` | zlib, for tarballs (C library) | C code |
| `zstd-sys` | zstd (C library) | C code |

That is the whole list of crates that do not build; it says nothing yet
about which of them the offline local-deps install path actually calls.
Beyond building, an install also needs **symlinks and hard links** —
aube's linker builds `node_modules` out of them — which the in-browser
WASI shim Vivarium uses today does not provide (to be confirmed).

## Architecture (proposed)

```text
browser page
├── terminal UI            — renders the session; built-in ls / cat / rm / cd
├── terrarium runtime      — implements the imports the CLI's wasm module uses
│   ├── filesystem         — in-memory tree with symlinks, hard links, locks
│   ├── process            — argv, env, cwd, exit code, stdio wired to the terminal
│   └── (later) threads, clock, random, network stubs
└── aube.wasm              — aube compiled for the runtime's target
```

The runtime starts from the WASI preview 1 surface — it is what
`wasm32-wasip1` Rust targets already call — and adds what aube needs
beyond it. Whether those additions are extra WASI-shaped imports, a
different target, or patches to aube that avoid the call is decided per
item, preferring whichever keeps upstream aube unpatched.

## Milestones

1. **Build.** aube compiles for the chosen target, with a patch set that
   is as small as possible and documented item by item.
2. **Headless run.** `aube --version`, then `aube install` on a local
   fixture, runs under the terrarium runtime in Node.js, with output
   compared against a native run of the same command.
3. **Browser terminal.** The same session in a page: a fixture project
   is preloaded, the reader types the commands.
4. **Vivarium.** A Vivarium page reproduces #1645 as a terminal
   session, baseline and fix side by side.

## Open questions

- **Threads.** Does the local-deps install path need real threads, or
  can aube run on a current-thread runtime in wasm? Real threads in the
  browser mean `SharedArrayBuffer`, which needs cross-origin isolation
  headers that GitHub Pages cannot set (to be verified; a service-worker
  workaround exists).
- **C libraries.** Build them with a C toolchain for wasm (wasi-sdk), or
  switch to pure-Rust implementations behind aube's own features?
- **Symlinks and hard links.** Extend an existing shim, or write the
  filesystem from scratch?
- **Upstream changes.** Which of the needed changes (feature gates,
  `cfg(target_family = "wasm")`) would aube accept upstream, so that
  terrarium builds an unmodified release?
- **Startup.** No target number yet. Measure download size, compile
  time, and time to first output at each milestone, and compare with
  WebVM on the same machine.

## Prior art

- [WebVM](https://webvm.io/) / CheerpX — x86 JIT to wasm plus a Linux
  syscall emulation layer; runs unmodified Debian, loads disk blocks on
  demand.
- [BrowserPod](https://labs.leaningtech.com/blog/browserpod-20) —
  applications compiled to wasm on a Linux syscall layer; implements
  `fork` with compiler-injected instrumentation. The closest design to
  terrarium's.
- [container2wasm](https://github.com/ktock/container2wasm) and
  [qemu-wasm](https://ktock.github.io/qemu-wasm-demo/) — full-system
  emulation of a container image or a board.
- [Linux-Wasm](https://joelseverin.github.io/linux-wasm/) — the Linux
  kernel itself ported to wasm.
- Vivarium's `aube-1645` recipe — aube's lockfile reader compiled to
  `wasm32-wasip1` with one patch to aube-util, running on
  `@bjorn3/browser_wasi_shim`. The starting point for milestone 1.
