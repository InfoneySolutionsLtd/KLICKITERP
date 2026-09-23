# ERP GitOps deployment

This directory contains the production Docker Compose bundle for the ERP.

Services:

- Nginx ingress
- Next.js web application
- NestJS API
- NestJS background worker
- PostgreSQL
- Redis

The Compose project name is `klickit-erp-dev`. Kong integration is optional.
Without `KONG_NETWORK`, the ERP runs using its normal Nginx and host-port
configuration only. Set `KONG_NETWORK` to Kong's existing Docker network name
to enable the Kong overlay.

When Kong integration is enabled, configure Kong to route the ERP hostname to:

```text
http://klickit-erp-dev:80
```

The host port defaults to `5080` for direct health checks or non-Kong access.
Do not configure Kong to use `127.0.0.1:5080`, because that points to the Kong
container itself.

## Manual deployment

On the deployment host:

```sh
cp gitops/.env.production.example .env
# Fill in all secrets and school-specific values.
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml pull
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml up -d
```

When using Kong, verify that the shared network exists and that the Kong
container is attached to it:

```sh
docker network inspect "$(grep '^KONG_NETWORK=' .env | cut -d= -f2-)"
```

If `KONG_NETWORK` is unset, skip this check. If the deployment host uses a
different network name, update `KONG_NETWORK` in `.env` and attach Kong to that
network before deploying.

Run database migrations before a new release is served:

```sh
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml \
  run --rm api pnpm --filter @klickit/server migration:run
```

The release workflow publishes API, Worker, and Web images to GHCR, copies the
Compose/Nginx files to the host, runs migrations, and restarts the stack.

The same operations can be run directly on the host:

```sh
KFE_VERSION=v1.2.3 ERP_IMAGE_REGISTRY=ghcr.io/your-org ./gitops/scripts/deploy.sh
KFE_VERSION=v1.2.2 ERP_IMAGE_REGISTRY=ghcr.io/your-org ./gitops/scripts/rollback.sh
```

GitHub Secrets

DEPLOY_HOST= 122.333.333
DEPLOY_USER= username
DEPLOY_SSH_KEY= key__end
DEPLOY_PATH= erp
