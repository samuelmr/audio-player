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
