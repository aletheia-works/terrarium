#!/usr/bin/env bash
#MISE description="Verify fixed inputs and acquire the pinned npm RC before installation"
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
if [[ $# -eq 0 ]]; then
  set -- --from "${FORMICARIUM_INPUTS_DIR:?Set FORMICARIUM_INPUTS_DIR}"
fi
bun "$root/scripts/prepare-formicarium.mjs" "$@"
node "$root/scripts/fetch-formicarium-rc.mjs"
