# Music Library

A public music library for uploading, organizing, editing, playing, publishing, and sharing songs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/music-library` — responsive React/Vite library UI and album detail views.
- `artifacts/api-server/src/routes/music.ts` — music CRUD and dashboard API.
- `lib/db/src/schema/music.ts` — PostgreSQL source of truth for albums and tracks.
- `lib/api-spec/openapi.yaml` — source of truth for generated API clients and validation.
- `artifacts/api-server/src/routes/storage.ts` — direct-to-object-storage upload and file serving.

## Architecture decisions

- Audio and artwork bytes go to App Storage through presigned uploads; PostgreSQL stores only metadata and object paths.
- Unpublished uploads are private drafts. Publishing copies audio and artwork to the public `Joshb0513/Music-Library-Log` GitHub repository; its raw file links can be played and downloaded without a token.
- The browser uses name-only sign-in for session identity; no GitHub account is required. Repository writes use the server-side GITHUB_REPOSITORY_TOKEN. Browsing and downloading public music do not require sign-in.
- Album and track metadata are separate entities so albums can be browsed as a directory while tracks can also exist as singles.
- Browser sharing uses text/email deep links plus the native share sheet when available, so it works without a dedicated messaging provider.
- Browser authentication uses the managed OIDC flow and cookie sessions; uploads and all create/edit/delete actions are protected. Private App Storage reads are restricted to the owning user.

## Product

- Add and edit track title, cover art, artist, year, album, and audio file; drafts stay private until published.
- Create, edit, delete, and browse albums.
- Search the public library, play published tracks, and see recent additions and listening totals.
- Publish individual tracks or albums; publicly published audio can be downloaded by anyone.
- Share the library, an album, or a song by text, email, native share sheet, or copied link.

## User preferences

- The user asked for a platform centered on uploading songs, editing song metadata, organizing albums, listening in-browser, and sharing with friends.

## Gotchas

- Uploads and private drafts require a signed-in session. Publishing to the public GitHub repository makes copies accessible to anyone; deleting them from the library cannot guarantee copies are removed.
- GitHub publishing is limited to 50 MiB per file to stay below the repository API's large-file warning threshold.
- Run API codegen after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
