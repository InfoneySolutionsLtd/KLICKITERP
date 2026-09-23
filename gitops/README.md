# ERP GitOps deployment

This directory contains the production Docker Compose bundle for the ERP.

Services:

- Nginx ingress
- Next.js web application
- NestJS API
- NestJS background worker
- PostgreSQL
- Redis
- RustFS object storage and bucket initialization

The Compose project name is `klickit-erp`. Kong integration is optional.
Without `GATEWAY_NETWORK`, the ERP runs using its normal Nginx and host-port
configuration only. Set `GATEWAY_NETWORK` to Kong's existing Docker network name
to enable the Kong overlay.

When Kong integration is enabled, configure Kong to route the ERP hostname to:

```text
http://klickit-erp:80
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
docker network inspect "$(grep '^GATEWAY_NETWORK=' .env | cut -d= -f2-)"
```

If `GATEWAY_NETWORK` is unset, skip this check. If the deployment host uses a
different network name, update `GATEWAY_NETWORK` in `.env` and attach Kong to that
network before deploying.

RustFS is internal to the ERP stack. The API and worker continue to use the
compatible `minio:9000` hostname, and the `minio-init` service creates
`klickit-erp-files` and `MINIO_BUCKET_DEFAULT` automatically. Set a
unique `MINIO_ROOT_PASSWORD` in `.env`; the example value must not be used in
an actual deployment.

For browser file viewing, configure `MINIO_PUBLIC_ENDPOINT` to the dedicated
RustFS S3 hostname and set `MINIO_PUBLIC_USE_SSL=true` when TLS is enabled. The
API and worker continue using the internal `MINIO_ENDPOINT` for storage
operations, while signed URLs use the public endpoint.

When the gateway overlay is enabled, configure the file hostname in Kong to
route to:

```text
http://klickit-erp-storage:9000
```

The RustFS service joins the gateway network only when the overlay is used; its
console remains disabled.

Run database migrations before a new release is served:

```sh
docker compose --env-file .env -f gitops/compose/docker-compose.production.yml \
  run --rm api pnpm --dir packages/server migration:run
```

After the stack is updated, old unused release images can be cleaned up with:

```sh
docker image prune -af
```

This removes images not referenced by any container. It does not remove named
volumes, including PostgreSQL or RustFS storage volumes.

The release workflow publishes API, Worker, and Web images to GHCR, copies the
Compose/Nginx files to the host, authenticates the deployment host to GHCR,
runs migrations, and restarts the stack.

For a manual deployment, authenticate the server before pulling private images:

```sh
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io \
  --username "$GHCR_USERNAME" --password-stdin
```

`GHCR_READ_TOKEN` must be a GitHub token with `read:packages` access to the ERP
container images.

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
