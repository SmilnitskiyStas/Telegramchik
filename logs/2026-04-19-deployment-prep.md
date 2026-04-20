# 2026-04-19 Deployment Prep

## What Changed

- added `apps/web/vercel.json` to support SPA route rewrites on Vercel
- added `apps/web/.env.example` with `VITE_API_URL`
- switched `apps/web` API base URL to `import.meta.env.VITE_API_URL` with localhost fallback
- documented recommended deployment topology in `docs/deployment.md`

## Why

The repository is now ready for a clean split deployment:

- static frontend on Vercel
- long-running API on a Node host
- managed MySQL-compatible database

This avoids forcing the current polling-based Express API into an unstable Vercel Hobby shape.
