# CLAUDE.md

Ctrl– audio player: a music player for MP3s in an S3 bucket, built from one
codebase as a web app (PWA) and a Samsung TV (Tizen) app. The README is the
main documentation; read its *Development and contributing* section for the
layout, the test tiers and how translations work. This file adds what the
README doesn't say, or what is easy to miss.

## Workflow

- Before changing files, create a branch for the task and a git worktree for
  it (e.g. `../audio-player-<branch>`), unless already on a task branch.
  Several chats may work on this repo at the same time, and they would
  otherwise change each other's files. Run `npm install` in a new worktree.
- Never commit to `main` directly. When the task is done, ask whether to push
  the branch or merge it into `main` locally. A pushed branch is published at
  `https://audioplayer.ctrldash.app/<branch>/` (slashes become dashes), which
  is how the user tries changes on their phone.
- Run `npm run check` before committing. In a worktree, give it ports of its
  own so it can't clash with another copy: `TEST_PORT=<n> npm run check`
  (uses `n` and `n+1`; the default is 4173).
- Commit messages are sentences saying what changed, like the ones in
  `git log`. Separate unrelated changes into their own commits.

## With every change

- **Texts:** user-visible text comes from `locale` (`src/locale.js`), never
  written into the code or the HTML. Add or change a text in
  `src/i18n/en.js` and every other file in `src/i18n/` in the same change.
  `tests/unit/i18n.test.js` catches a missing key but not a translation left
  behind when the English changes, so update those by hand. List new or
  changed Finnish texts in your summary: the user reviews them.
- **README:** update it when a change affects the settings, how the bucket is
  organized, the npm scripts or scripts in `scripts/`, the tests, the TV
  install steps or supported TVs, or the deployment.
- **Tests:** add or update tests for the change, in the style of the tests
  around them.

## Constraints

- The TV app must run on Tizen 6 (Chromium 76). Babel handles the script, but
  the CSS must avoid what Chromium 76 lacks (flexbox `gap`, `inset`,
  `clamp()`...). `npm run test:build` checks this.
- The repo must build and pass its tests for anyone who forks it: no real
  bucket, keys or addresses in the code or tests. The tests use the fake S3
  of `tests/e2e/server.js`.
- Dependencies stay at their latest versions. When an update breaks
  something, fix the code; don't pin versions.
- The TV has no keyboard. On the remote, Right opens a folder, Left closes
  it, and OK adds the focused item to the queue. Text comes in by pasting from
  the SmartThings phone app. The web app is used by clicking and tapping, so
  its navigation differs on purpose.
- Branch previews share the browser storage of the site. Raising the
  IndexedDB version in `src/db.js` breaks older versions of the app in that
  browser.

## Decisions not to revisit

- Closing the settings dialog (Esc, backdrop) keeps unsaved edits; only the
  Reset button restores the saved values.
- Album art isn't stored for offline use. Offline, tracks are shown as if they
  had no art.
- Offline playlists are stored in the same JSON format as the playlists in
  the bucket. Downloading them goes before preloading the next track.

## Trying on a real TV

Needs Tizen Studio and a TV in developer mode (see the README). Install with
`TV_IP=<address> npm run install:tv`, then drive the app with
`scripts/tv-debug.js` (keys, JavaScript, screenshots; usage at its top).
