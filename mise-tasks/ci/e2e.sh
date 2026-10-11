#!/usr/bin/env bash
#MISE description="Test legacy and formicarium terminals in all browsers"
set -euo pipefail
bash mise-tasks/terrarium/prepare.sh
(cd packages/terrarium && bun install --frozen-lockfile)
bash mise-tasks/build/fetch.sh v2.6.1
bash mise-tasks/ci/pitchfork-prepare.sh
bash mise-tasks/web/stage.sh
export TERRARIUM_PITCHFORK_REF
TERRARIUM_PITCHFORK_REF=$(jq -r .ref .vendor/pitchfork-e2e.json)
bash mise-tasks/site/build.sh .vendor/site-legacy legacy
export TERRARIUM_BUN
TERRARIUM_BUN=$(command -v bun)
export TERRARIUM_SITE_DIR="$PWD/.vendor/site-legacy"
(cd packages/terrarium && bun run test:e2e)
bash mise-tasks/site/build.sh .vendor/site-formicarium
export TERRARIUM_SITE_DIR="$PWD/.vendor/site-formicarium"
(cd packages/terrarium && bun x playwright test --config playwright.formicarium.config.ts --workers=1 --retries=0)
