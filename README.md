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

Open the [workspace](http://localhost:3001). Select **Ask assistant** to list today’s exceptions, summarize the queue, or get a seven-day recap. In the AP specialist view, try **Suggest routing → Route suggested cases** or type `Route Meghna to the Bangladesh backup owner, then request evidence for Northgate`. Review the draft and apply it to update the cases.

Open **Exceptions → Assigned → Meghna Agro Chemicals** to view its routing history. **Preview as** switches between the AP, approver, controller, and supplier views. The assessment guide is in the workspace navigation.

For the prototype alone, `bun run dev:web` is enough after configuring `apps/web/.env`. The role switcher, sample cases, audit history, and uploads use browser storage. Evidence links open in the same browser profile and web origin. The assistant, AI overview, drafts, and text checks use local rules. The sign-in and authenticated dashboard still use the API.

The original standalone guide and source PDF are in the parent folder. The web app includes the guide text and starts with its own sample state.

Exceptions and invoice details show the accounting period and final-approval cutoff. The prototype starts each sample invoice in its opening month and moves outstanding invoices to the next period after the third working day. Each move appears in the decision timeline. The prototype uses local time in New York, London, and Dhaka, counts Saturday and Sunday as weekends for the US and UK and Friday and Saturday for Bangladesh, and uses a weekend-only calendar. Open the workspace to catch up on missed cutoffs.

The supplier thumbnails illustrate each sample company’s industry. [CNC machining](https://www.pexels.com/photo/close-up-photo-of-metal-tool-10406128/) · [Packaging](https://www.pexels.com/photo/close-up-of-boxes-5025503/) · [Freight](https://www.pexels.com/photo/truck-on-road-near-park-9754798/) · [Office supplies](https://www.pexels.com/photo/flat-lay-shot-of-desk-with-office-items-9930282/) · [Agriculture](https://www.pexels.com/photo/plantation-with-green-crops-growing-in-agricultural-farm-6216870/) · [Components](https://www.pexels.com/photo/a-pile-of-metal-spare-parts-7568430/) · [Engineering](https://www.pexels.com/photo/modern-industrial-production-facility-interior-38804512/)

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
