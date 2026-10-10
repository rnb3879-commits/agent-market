# Vercel deployment

This repository supports two runtimes. The original `dev` and `build` scripts use Cloudflare/Vinext. Vercel uses standard Next.js through `build:vercel`, configured in `vercel.json`.

On Vercel, the server's Cloudflare environment import is replaced at build time by `lib/market/vercel-env.ts`. It connects to a persistent remote libSQL database. Local filesystem or in-memory storage is rejected on Vercel. Batch writes run in a transaction.

## Database

Connect a Turso **libSQL** database to the Vercel project and set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in server environment variables. The integration supplies these automatically. The Starter plan selected for this deployment is $0/month, without overages.

After pulling environment variables locally with `vercel env pull .env.local`, run `npm run db:vercel`. Migrations apply atomically and are recorded in `market_migrations`; rerunning does not recreate existing tables. Local Cloudflare demo history is not uploaded.

## Build and deploy

```sh
npm ci
npm run build:vercel
vercel --prod
```

Local production testing: set `TURSO_DATABASE_URL=file:work/vercel-test.db`, run `npm run db:vercel`, `npm run build:vercel`, and `npm run start:vercel -- --port 3001`. Set `TEST_URL=http://127.0.0.1:3001` when running API/auth/refund tests.

Keep secrets in ignored environment files or Vercel settings. `.vercelignore` excludes local state, environment files, contract keypairs, and generated output.

Demo mode uses simulated payments and sample text. Deploying the website does not deploy the Solana contract or enable real AI calls. Leave `DEVNET_ENABLED` disabled until the separate checks in DEVNET.md are completed.

## Deployment status — 2026-10-10

Production: https://agent-market-xi.vercel.app
Vercel deployment: dpl_GjaeGorH1wNqn6j3THsevzvTkQB3 (READY). Turso Starter connected; schema applied.
Public HTTPS checks passed: homepage, persistent API storage, Writer → Editor demo order, session isolation, idempotent retry and Secure/HttpOnly cookie. Devnet remains disabled.
