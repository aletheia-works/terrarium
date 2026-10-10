#!/usr/bin/env bash
# Compile an already resolved source tree to a static musl guest.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tool=${1:?tool required}
source_dir=${2:?source required}
out=${3:?output required}
target=x86_64-unknown-linux-musl
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc
export CC_x86_64_unknown_linux_musl=musl-gcc
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$out/cargo}
cargo_bin=$(cd "$root" && mise exec -- rustup which cargo)
rust_bin=$(dirname "$cargo_bin")
export RUSTC="$rust_bin/rustc"
export PATH="$rust_bin:$PATH"
cd "$source_dir"
case "$tool" in
  aube)
    : > "$out/empty-primer.rkyv.zst"
    AUBE_PRIMER_PATH="$out/empty-primer.rkyv.zst" "$cargo_bin" build --release --locked --target "$target" -p aube --bin aube
    ;;
  pitchfork)
    export PATH="$out:$PATH" AUBE_NO_UPDATE_CHECK=1
    node_bin=$(cd "$root" && mise where node@24.21.0)/bin
    (
      cd ui
      export PATH="$node_bin:$PATH"
      aube install --frozen-lockfile
      aube run build
      test -f dist/index.html
    )
    "$cargo_bin" build --release --locked --target "$target" --bin pitchfork
    ;;
  *) echo "no native guest builder: $tool" >&2; exit 1 ;;
esac
install -m 0755 "$CARGO_TARGET_DIR/$target/release/$tool" "$out/$tool"
