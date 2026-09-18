# Codeforces Companion

A Chrome extension that syncs your Codeforces solving history and helps you find the right
problem to solve next.

## Features

- **Codeforces profile sync** — sync a Codeforces handle to pull the problemset and your
  submission history.
- **Cached data and cache restoration** — synced data is cached locally, so reopening the
  popup restores your stats and filters instantly without a new network sync.
- **Solved / Attempted / Unattempted classification** — every tracked problem is classified
  from your submission history.
- **Rating range filtering** — filter problems by a minimum and maximum rating.
- **Multiple status selection** — filter by any combination of Solved, Attempted, and
  Unattempted at once, not just one at a time.
- **Tag filtering and tag selector** — filter by problem tags, either by typing them
  directly or picking from a menu of your recently used and all available tags.
- **Random problem** — get a random problem from your tracked dataset.
- **Filtered random problem** — get a random problem matching your current rating, status,
  and tag filters.
- **Problem statistics** — total, solved, attempted, and unattempted counts, shown both for
  your complete synced dataset and for whatever the current filters match.
- **Success rate** — solved vs. attempted ratio, shown alongside the statistics.
- **Rating distribution** — a breakdown of matching problems across Codeforces rating
  levels, scoped to your current filters.
- **Last synced state** — the popup shows how long ago your data was last synced.
- **Friendly sync/error states** — sync problems (like an invalid handle) are shown as
  clear, readable messages instead of raw errors.

## How it works

The extension talks to the public Codeforces API from a background service worker, which
normalizes the responses and classifies each problem as solved, attempted, or unattempted
based on your submissions. That data is cached locally in the browser so the popup doesn't
need to re-sync on every open. All filtering, statistics, and random-selection logic runs
against that local cache in the popup itself.

For the detailed data flow, module layout, and internal design decisions, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Tech stack

- TypeScript
- Vite
- CRXJS (`@crxjs/vite-plugin`)
- Chrome Manifest V3
- Codeforces API

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build, output in dist/
npm run typecheck  # tsc --noEmit
npm test           # run the test suite
```

To load the extension locally: run `npm run build`, then in Chrome go to
`chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select the
generated `dist/` folder.

## Known limitation

The extension classifies and filters problems against the tracked Codeforces problemset
(the general problem list returned by the Codeforces API), not against a user's full
Codeforces profile. This is not necessarily identical to a user's profile-wide
solved-problem universe. As a result, the statistics and counts shown in the extension
represent the tracked problemset, and may not exactly match the totals shown on a user's
Codeforces profile page.
