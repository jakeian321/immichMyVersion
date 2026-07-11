# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is the **Immich web app** — a SvelteKit (Svelte 5, runes mode) frontend for the Immich self-hosted photo/video
management platform. In development it runs as a SvelteKit Node server with `ssr = false` / `csr = true` (see
`src/routes/+layout.ts`); in production it is built as a static SPA (`@sveltejs/adapter-static`, fallback
`index.html`) and served by the Immich server project (`../server`).

All API calls go through the generated `@immich/sdk` package (`file:../open-api/typescript-sdk` — a sibling
directory, not inside `web/`). `src/lib/utils/server.ts` wires the SvelteKit `fetch` into the SDK's `defaults.fetch`
and bootstraps i18n + server config on every layout load.

## Commands

Run from the `web/` directory.

- `npm run dev` — start the dev server (port 3000). Proxies `/api`, `/.well-known/immich`, and `/custom.css` to
  `IMMICH_SERVER_URL` (defaults to `http://immich-server:2283/`) — set this env var to point at a real backend.
- `npm run build` — production build (static SPA into `build/`).
- `npm run test` — run all vitest tests once.
- `npm run test -- path/to/file.spec.ts` — run a single test file (vitest picks up extra args as filters).
- `npm run test:watch` — vitest in watch mode.
- `npm run test:cov` — tests with coverage.
- `npm run lint` / `npm run lint:fix` — ESLint (`--max-warnings 0`).
- `npm run format` / `npm run format:fix` — Prettier check/write.
- `npm run check:svelte` — `svelte-check` (warnings fail; `asset-grid.svelte` is excluded).
- `npm run check:typescript` — `tsc --noEmit`.
- `npm run check:code` — format + lint + svelte-check + typescript check (run this before considering a change done).
- `npm run check:all` — `check:code` + `test:cov`.

## Architecture

### Routes (`src/routes`)

- `(user)/` — the main authenticated app shell (`+layout.svelte` provides the sidebar/navigation). Sub-routes
  include `photos`, `albums`, `archive`, `collections`, `combine`, `explore`, `favorites`, `folders`, `map`,
  `memory`, `people`, `photo-explore`, `places`, `search`, `sharing`, `shared-links`, `tags`, `trash`,
  `user-settings`, `utilities`, `partners`, `buy`.
- `admin/` — admin console pages (jobs status, library management, repair, server status, system settings, user
  management).
- `auth/` — login, register, onboarding, change-password (unauthenticated flows).
- `link/` — public shared-link viewer.

Each route typically pairs a `+page.svelte` with a `+page.ts` loader that fetches data via `@immich/sdk` before
render.

### State (`src/lib/stores`)

A mix of legacy Svelte stores (`*.store.ts`, using `writable`/`derived`) and Svelte 5 rune-based state
(`*.svelte.ts`, using classes with `$state`/`$derived`). Notable ones: `assets-store.svelte.ts` (timeline/asset
grid state), `asset-interaction.svelte.ts` (selection state), `user.store.ts` / `user.svelte.ts`, `websocket.ts`
(socket.io live updates), `search.svelte.ts`, `sidebar.svelte.ts`, `memory.store.svelte.ts`.

### Components (`src/lib/components`)

Organized by feature/page: `photos-page`, `album-page`, `asset-viewer`, `people-page`/`faces-page`, `map-page`,
`memory-page`, `places-page`, `share-page`/`sharedlinks-page`, `admin-page`, `onboarding-page`,
`user-settings-page`, `utilities-page`. Cross-cutting UI lives in `shared-components` (dialogs, context menus,
navigation bar, gallery viewer, scrubber, search bar, notifications, portals, etc.) and `elements`. `forms/`
holds shared form components. `@immich/ui` provides the base design-system primitives (buttons, inputs, etc.).

### Utilities (`src/lib/utils`)

Shared helpers for assets, dates/timezones, EXIF, thumbnails, timeline math, byte formatting, album/tag/people
operations, navigation, auth, and i18n. Many have colocated `*.spec.ts` tests.

### Album Collections (fork feature)

A "collection" is a named group of existing albums. It is implemented entirely in the web app with no backend
changes: a collection is a regular asset-less album whose `description` field holds JSON
(`{ marker: 'immich-web-collection', albumIds: [...] }`). All helpers (`isCollectionAlbum`,
`getCollectionAlbumIds`, `createCollection`, `setCollectionAlbums`, `renameCollection`, `deleteCollection`) live
in `src/lib/utils/album-utils.ts` — always go through them rather than parsing descriptions directly.

There are three ways to manage a collection's albums:

- **Collections page** (`/collections`, `src/routes/(user)/collections/`) — cards per collection
  (`src/lib/components/collections-page/collection-card.svelte`) with a "search albums" combobox to link albums,
  plus rename/delete.
- **Albums page context menu** (`/albums`) — right-click an owned album → "Add to collections" opens
  `src/lib/components/album-page/add-to-collections-modal.svelte`, a checkbox list of all collections
  (pre-checked where the album is already linked; checking/unchecking adds/removes on save). The option is hidden
  for albums that are themselves collections. Wired up in `src/lib/components/album-page/albums-list.svelte`.
  Right-click is desktop-only — iOS Safari does not fire `contextmenu` on long-press.
- **Album detail page header** (`/albums/[albumId]`) — a folder-plus `CircleIconButton` in the top app bar
  (owned, non-collection albums only) opens the same modal. This is the touch-friendly entry point for
  iPhone/mobile, where the albums-page context menu is unreachable.

Because collections are albums, they also appear in the regular albums list. `AppRoute.COLLECTIONS` in
`src/lib/constants.ts` points at the page.

### i18n

Translation strings live in `../i18n/*.json` (top-level repo dir, aliased as `$i18n` via `svelte.config.js`), keyed
off `en.json`. Uses `svelte-i18n`; `src/lib/utils/i18n.ts` / `initLanguage()` set up the formatter and locale.
`src/app.d.ts` derives a `Translations` type from `en.json`'s keys for type-checked translation IDs.

### Testing

Vitest + `@testing-library/svelte`, jsdom environment, setup in `src/test-data/setup.ts` (initializes
`svelte-i18n`). Reusable test fixtures live in `src/test-data/factories/` (asset, album, person, user,
shared-link — built with `factory.ts`/`@faker-js/faker`). Test files are colocated with the code they test as
`*.spec.ts` or `*.test.ts`.

## Conventions

- Path aliases: `$lib` → `src/lib`, `@test-data` → `src/test-data`, `$i18n` → `../i18n`.
- ESLint enforces `object-shorthand`, no floating/misused promises, `await-thenable`, `require-await`, and
  `svelte/button-has-type`; unicorn rules are mostly relaxed (see `eslint.config.js` for the disabled set).
- Prettier uses `prettier-plugin-organize-imports` (with destructive code actions skipped),
  `prettier-plugin-svelte`, and `prettier-plugin-sort-json`, 120-char width, single quotes, trailing commas.
