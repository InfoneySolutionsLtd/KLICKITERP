#!/usr/bin/env bash
set -euo pipefail

: "${KFE_VERSION:?Set KFE_VERSION to the image tag}"
: "${ERP_IMAGE_REGISTRY:?Set ERP_IMAGE_REGISTRY to the image registry path}"

# Temporary fixed shared network for ERP/Kong integration testing.
GATEWAY_NETWORK="kong-erp-network"
compose=(docker compose --env-file .env -f gitops/compose/docker-compose.production.yml)
if [ -n "${GATEWAY_NETWORK:-}" ]; then
  if ! docker network inspect "$GATEWAY_NETWORK" >/dev/null 2>&1; then
    echo "Configured Kong Docker network '$GATEWAY_NETWORK' does not exist or is not accessible" >&2
    exit 1
  fi
  compose+=( -f gitops/compose/docker-compose.gateway.yml )
fi
export KFE_VERSION ERP_IMAGE_REGISTRY

"${compose[@]}" pull
"${compose[@]}" run --rm api pnpm --dir packages/server migration:run
"${compose[@]}" up -d
"${compose[@]}" ps

# Remove old release images that are no longer referenced by any container.
# This does not remove running containers, named volumes, or their images.
docker image prune -af
