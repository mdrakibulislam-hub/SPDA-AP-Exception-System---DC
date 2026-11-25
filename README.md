# SPDA AP Exception System — DC

This TypeScript monorepo uses TanStack Router, Hono, tRPC, SQLite, Drizzle, and Better Auth. Bun manages the workspace and runs the API. Turborepo runs development, build, and type-check tasks across packages.

## Local development

Install dependencies with [Bun](https://bun.sh/), then copy the environment examples on a fresh checkout.

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

Generate a secret with `openssl rand -hex 32` and set `BETTER_AUTH_SECRET` in `apps/server/.env`. The other example values work with the default local ports. Keep `.env` files out of Git.

```bash
bun run db:migrate
bun run dev
```

Drizzle creates `local.db` in the repository root and applies the initial auth schema. The [API](http://localhost:3000) serves tRPC under `/trpc` and Better Auth under `/api/auth`.

## Try the AP prototype

Open the [workspace](http://localhost:3001). Start with **AI overview → Review suggested cases → Route to owners** for the bulk flow, or open **Exceptions → Assigned → Meghna Agro Chemicals** to try backup-owner routing. **Preview as** switches between the AP, approver, controller, and supplier views. The assessment guide is in the workspace navigation.

For the prototype alone, `bun run dev:web` is enough after configuring `apps/web/.env`. The role switcher, sample cases, audit history, and uploads use browser storage. Evidence links open in the same browser profile and web origin. The AI overview, drafts, and text checks use local rules. The sign-in and authenticated dashboard still use the API.

The original standalone guide and source PDF are in the parent folder. The web app includes the guide text and starts with its own sample state.

## Workspace layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React app with TanStack Router file-based routes |
| `apps/server` | Hono API running on Bun |
| `packages/api` | tRPC router and procedures |
| `packages/auth` | Better Auth configuration |
| `packages/db` | Drizzle schema, database client, and migrations |
| `packages/ui` | Shared shadcn/ui components and styles |
| `packages/config` | Shared TypeScript configuration |

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev:web` / `bun run dev:server` | Run one app in development mode |
| `bun run build` | Build both apps |
| `bun run check-types` | Check TypeScript across the workspace |
| `bun run db:generate` | Generate a SQL migration after a Drizzle schema change |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Apply the schema directly to a disposable development database |
| `bun run db:studio` | Inspect the database in Drizzle Studio |
| `bun run env:generate` | Regenerate TypeScript environment accessors after editing an `.env.schema` file |
| `bun run auth:generate` | Regenerate the Drizzle auth schema after changing Better Auth options |

Varlock loads environment values for each app and generates typed accessors during `bun install`. The database workspace imports `DATABASE_URL` from the server's environment configuration.
