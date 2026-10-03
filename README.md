#usage
```sh
export S3BUCKET="music"
export S3ENDPOINT="https://eu2.contabostorage.com"
npm run build:pwa
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key index.html --content-type text/html --body dist/pwa/index.html
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key audioplayer.js --content-type text/javascript --body dist/pwa/audioplayer.js
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key sw.js --content-type text/javascript --body dist/pwa/sw.js
```

#layout
- `src/` code shared by both apps; `src/platform/` has what differs between them
- `pwa/` the web app's HTML template, service worker, manifest and icon
- `tizen/` the Samsung TV app's HTML template and `config.xml`

`npm run build` builds both apps, into `dist/pwa` and `dist/tizen`.

#tv
`npm run package:tizen` builds and signs `dist/tizen/CtrlMusic.wgt` with the active
certificate profile of Tizen Studio (set `TIZEN_STUDIO` if it's not in `~/tizen-studio`).
`TV_IP=192.168.x.x npm run install:tv` installs it on a TV in developer mode.
On the TV, open the settings and paste a settings code copied from the web app
into the text field, using the SmartThings app's keyboard on your phone.

The TV app runs on Tizen 6.0 and later, which means Samsung TVs from 2021 on. The oldest
of these have Chromium 76, so Babel compiles the TV app's script for it, and the
stylesheets avoid what it lacks (such as `gap` in flexbox, `inset` and `clamp()`).

#testing
Run `npm run check` before deploying. It builds both apps and runs every test that
doesn't need Tizen Studio. Run `npm run test:setup` once first, to download the
Chromium that the end-to-end tests use.

| Command | Needs | Tests |
| --- | --- | --- |
| `npm test` | Node | Unit tests of the source (`tests/unit`) |
| `npm run test:build` | Node | The built apps: their files, and that the TV app has nothing Chromium 76 lacks (`tests/build`) |
| `npm run test:pwa` | Node, Playwright's Chromium | The web app in Chromium (`tests/e2e/pwa`) |
| `npm run test:tv` | Node, Playwright's Chromium | The TV app in Chromium, worked with remote control keys (`tests/e2e/tv`) |
| `npm run check` | Node, Playwright's Chromium | All of the above |
| `npm run test:tizen` | Tizen Studio | Packages and signs the `.wgt` and checks it; with `TV_IP` set, installs and launches it on that TV |
| `npm run check:full` | Tizen Studio | `check` and `test:tizen` |

The end-to-end tests need no bucket or keys: `tests/e2e/server.js` serves the built
apps and a fake S3 bucket with the small library of `tests/e2e/library.js`. The TV
app gets stand-ins for the Tizen APIs it uses. Chromium can't be as old as the
oldest TVs, so the checks of `test:build` stand in for running on them.

Left to be tried by hand on the devices: playback on a real TV and its remote,
a Tizen 6 TV, a home screen app on iOS in the background, and scanning a QR code
with a camera.
