# 2026-04-19 Railway Single Service

## Added

- root `Dockerfile`
- root `.dockerignore`
- root `railway.json`
- `docs/railway-single-service.md`

## Changed

- web API base URL now uses same-origin in production
- API server now serves the built web app from the same process
- root package scripts now support one-step build/start for container deployment

## Purpose

Prepared the repository for a single-service Railway deployment where one container runs both the API and the built frontend.
