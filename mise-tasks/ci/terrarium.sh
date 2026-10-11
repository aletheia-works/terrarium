#!/usr/bin/env bash
#MISE description="Local equivalent of test-terrarium.yml"
#MISE dir="packages/terrarium"
set -euo pipefail
bash ../../mise-tasks/terrarium/prepare.sh --from "${FORMICARIUM_INPUTS_DIR:?Set FORMICARIUM_INPUTS_DIR}" --output "${FORMICARIUM_INPUTS_ROOT:-../../.vendor/formicarium-inputs}"
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
