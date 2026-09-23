#!/usr/bin/env bash
set -euo pipefail

: "${KFE_VERSION:?Set KFE_VERSION to the image tag}"
: "${ERP_IMAGE_REGISTRY:?Set ERP_IMAGE_REGISTRY to the image registry path}"

compose=(docker compose --env-file .env -f gitops/compose/docker-compose.production.yml)
export KFE_VERSION ERP_IMAGE_REGISTRY

"${compose[@]}" pull
"${compose[@]}" run --rm api pnpm --filter @klickit/server migration:run
"${compose[@]}" up -d
"${compose[@]}" ps
