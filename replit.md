# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Silo Feed Tracker (`artifacts/silo-tracker`)
A mobile-friendly web app for recording silo readings in the field.
- Record silo name/number, feed type, and amount remaining
- View latest reading summary per silo on the dashboard
- Full reading history with delete support
- Manage silos (add, edit, delete)
- Export all readings as CSV (opens in Excel or Google Sheets)
- Cloud sync to Google Drive and/or OneDrive (ready but not yet authorized)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Cloud Sync (NOT YET CONFIGURED)

The app is built to sync readings to Google Drive and/or OneDrive after each reading is recorded.
Both integrations require OAuth authorization via the Replit integration system.
- **Google Drive**: connector ID `connector:ccfg_google-drive_0F6D7EF5E22543468DB221F94F`
- **OneDrive**: connector ID `connector:ccfg_onedrive_01K4E4CFAKZ9ARQZBWZW4HD05Y`
- Once authorized, set `GDRIVE_ACCESS_TOKEN` and/or `ONEDRIVE_ACCESS_TOKEN` environment variables
- The backend reads these at runtime — no code changes needed

## Database Schema

- `silos` — silo name and optional default feed type
- `readings` — per-silo readings: feed type, amount remaining, unit, notes, date

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
