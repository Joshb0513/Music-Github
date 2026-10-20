# Vercel deployment and security guide

This project now has a Vercel Node.js Function entry point (`api/[...path].ts`), name-only sign-in, PostgreSQL-backed sessions, and a Git LFS upload flow for new public uploads. The audio file bytes go directly from the browser to the Git LFS upload URL; they do not pass through Vercel's request-size-limited Function. The app commits a small Git LFS pointer into `Joshb0513/Music-Library-Log` using a server-side repository credential.

## Important public-library behavior

The owner selected a **public repository and public drafts**. Therefore uploaded audio, artwork, filenames, and associated track/album metadata are publicly accessible. Anyone may copy files; deleting an app record does not guarantee that a public GitHub asset or cached copy disappears. Do not upload private, confidential, or unlicensed audio.

## Before deploying

1. Ensure `Joshb0513/Music-Library-Log` is public and Git LFS is enabled. Git LFS may require available GitHub storage/bandwidth quota or billing. Test a small MP3 and image before migrating the full library.
2. Create a fine-grained GitHub credential with access only to `Joshb0513/Music-Library-Log`, granting repository Contents read/write and the permissions needed for Git LFS. Do not use an organization-wide or unrelated-repository token. If possible, use a GitHub App installation token minted server-side rather than a long-lived PAT.
3. Provision a managed PostgreSQL database compatible with `pg`/Drizzle (for example, Neon) and apply the existing Drizzle schema/migrations before first login.
4. Import the repository into Vercel with the repository root as the Root Directory. Use the `Vercel` framework configuration in `vercel.json`; do not set the root to `artifacts/music-library` because the API and workspace packages are at the root.
5. Add these environment variables in Vercel Project Settings → Environment Variables. Add them to Production and Preview only if those deployments should be enabled.

| Variable | Purpose |
| --- | --- |
| `GITHUB_REPOSITORY_TOKEN` | Server-side fine-grained repository credential for GitHub Contents API and Git LFS. Never prefix with `VITE_`. |
| `DATABASE_URL` | PostgreSQL connection string. Use TLS and the provider's pooled connection string when recommended. |

6. Deploy. Verify `/api/healthz`, name sign-in at `/api/login`, `/api/auth/user`, a small image upload, a music upload, playback, download, and publishing before announcing the new site.

## Upload architecture

- Sign-in accepts a display name and creates an HttpOnly, server-side session; no GitHub account or OAuth app is needed.
- Repository writes use `GITHUB_REPOSITORY_TOKEN`, which stays server-side and is never sent to the browser.
- The browser calculates SHA-256, requests a Git LFS upload action from the Function, uploads bytes directly to the HTTPS action URL, then asks the Function to commit the Git LFS pointer.
- New uploads are placed under `uploads/<account-id>/...` in the public repository. The application allows public access to draft records because this was explicitly selected.
- Vercel Functions do not receive the audio payload, avoiding their body-size limit. The app limits new assets to 50 MiB and validates type declarations, size, SHA-256 format, upload ownership path, and the HTTPS upload target.

## Legacy data caveat

Tracks created before this migration may still point at Replit Object Storage paths (`/objects/...`). Those old files need to be migrated to Git LFS and their database paths updated. The legacy compatibility code may still attempt Replit object storage for old records, so do not delete the old storage bucket until you have migrated and verified every existing track and cover image. Replit object-storage-backed legacy endpoints are not used for new uploads.

## Security review performed

- Added common security headers, disabled Express `X-Powered-By`, and retained 100 KiB JSON/form body limits.
- Name-only sign-in is intentionally not identity verification: anyone can enter any name and impersonate that contributor. Do not treat a display name as a security boundary.
- Sessions use random 256-bit IDs in HttpOnly, SameSite=Lax cookies and expire after 30 days.
- Repository API access is restricted in code to `Joshb0513/Music-Library-Log`; credentials are read from server environment variables and never from `VITE_*` variables.
- New audio uploads use direct HTTPS Git LFS action URLs rather than routing binary data through Vercel Functions.
- No hard-coded credential was intentionally added to the source. A static source scan is not a substitute for Git-history secret scanning or a dependency audit.

## Release checks still required

This environment did not have pnpm or network access, so a full production build, dependency audit, live OAuth round-trip, PostgreSQL migration, Git LFS upload, and GitHub publication could not be executed here. Before production release, run:

```sh
corepack enable
corepack prepare pnpm@10.8.1 --activate
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/music-library typecheck
pnpm --filter @workspace/music-library build
pnpm audit
```

Also scan current files and Git history for leaked credentials, rotate any exposed credentials, and verify the repository token can only write to the intended repository. Do not treat this static review as a guarantee that the project has no vulnerabilities.
