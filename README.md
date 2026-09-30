# terrarium

> Run one CLI tool in the browser — no emulator, no kernel, just the
> system calls that tool needs.
> Part of [`aletheia-works`](https://github.com/aletheia-works).

## Why

[Vivarium](https://github.com/aletheia-works/vivarium) reproduces bugs
in the browser so anyone can check a claim without installing anything.
For a library, a reproduction script that imports it and prints the
result is the natural shape. For a CLI tool, it is not: people meet a
CLI in a terminal, so the reproduction should be a terminal session —
type `aube install`, see what aube actually prints.

Browser Linux environments such as [WebVM](https://webvm.io/) already
feel like a real server, but they carry a whole distribution and an x86
JIT to get there. terrarium goes the other way: it gives up generality
to run **one specific CLI**, compiled to WebAssembly, on top of only the
system calls that CLI uses. The bet is that a runtime this narrow can
start faster and ship smaller than a general one.

## Status

Design stage. The first target is [aube](https://github.com/aubepkg/aube),
a Node.js package manager written in Rust: an offline `aube install` of a
project with only local (`file:` / `link:`) dependencies, run from a
terminal in the browser.

See [`docs/design.md`](docs/design.md) for the plan and the open
questions.

## License

Apache License 2.0
