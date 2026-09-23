# ERP GitOps deployment

This directory contains the production Docker Compose bundle for the ERP.

Services:

- Nginx ingress
- Next.js web application
- NestJS API
- NestJS background worker
- PostgreSQL
- Redis

The Compose project name is `klickit-erp`. The default public port is
`5080` so it can coexist with the Academy gateway on ports `80/443` and the
Academy development services on their existing ports.

## Manual deployment

On the deployment host:

```sh
cp gitops/.env.production.example .env
# Fill in all secrets and school-specific values.
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml pull
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml up -d
```

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
