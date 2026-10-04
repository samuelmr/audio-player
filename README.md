# Ctrl– audio player

A music player for your own music library, kept in an S3-compatible object
storage bucket (AWS S3, Contabo, Backblaze B2, Wasabi, MinIO, Cloudflare R2…).
It comes in two forms:

- a web app (PWA) for desktop and mobile browsers, which can also be added to
  the home screen and save playlists for offline listening
- a Samsung TV app (Tizen), worked with the TV's remote control

The app talks to your bucket directly from the browser. There is no server of
its own, and your keys stay on your device.

- [Using the player on a computer or phone](#using-the-player-on-a-computer-or-phone)
- [Using the player on a Samsung TV](#using-the-player-on-a-samsung-tv)
- [Development and contributing](#development-and-contributing)

## Using the player on a computer or phone

### What you need

- An S3-compatible bucket for your music, and an access key that can read it.
  A key that can only read is enough, and the safest choice.
- MP3 files. Other formats are not listed.
- A browser. The app is ready to use at
  <https://audioplayer.ctrldash.app/>, or you can host a copy of your
  own, see [Installing the web app](#installing-the-web-app).
- The [AWS CLI](https://aws.amazon.com/cli/) or another S3 tool for
  uploading. The examples below use the AWS CLI, which works with any
  S3-compatible provider through `--endpoint-url`.

The examples use these variables. Set them to your own values:

```sh
export S3BUCKET="music"
export S3ENDPOINT="https://eu2.contabostorage.com"
```

Configure the AWS CLI with a key that can also write to the bucket
(`aws configure`). Give the player its own read-only key if your provider
supports one.

### How the bucket is organized

The player shows the bucket's folders as your library and lists the `.mp3`
files in them. Put the tracks in a folder for the artist and a subfolder for
the album:

```text
music/                                 ← the bucket
├── ABBA/
│   └── Arrival/
│       ├── 01 Dancing Queen.mp3
│       ├── 02 Knowing Me, Knowing You.mp3
│       └── cover.jpg
├── Miles Davis/
│   └── Kind of Blue/
│       ├── 01 So What.mp3
│       └── cover.jpg
├── Road trip.json                     ← a playlist
└── Sunday morning.json                ← another playlist
```

Without any other information, the player takes the artist, album and title of
a track from its path, `Artist/Album/Title.mp3`. More details come from the
object's metadata. The player reads these keys:

| Metadata key | Meaning |
| --- | --- |
| `artist` | Artist |
| `album` | Album |
| `title` | Track title (`name` also works) |
| `tracknumber` | Track number |
| `length` | Duration in **milliseconds** |
| `year` | Year (`recordingtime` also works) |
| `genre` | Genre |
| `keywords` | Keywords |
| `image` | Key of the album art in the same bucket, such as `ABBA/Arrival/cover.jpg` |

S3 stores metadata as `x-amz-meta-*` headers, which can only hold ASCII text.
The player URL-decodes every value, so **URL-encode the values** when uploading
(`Björk` → `Bj%C3%B6rk`). Plain ASCII values without a `%` work as they are.

While a track plays, the player shows its album art and takes its color from
the art.

### Playlists

A playlist is a JSON file at the root of the bucket. Its file name is the name
shown in the player. `url` is the key of the track in the bucket. The other
fields of a track are the same as the metadata keys above, written out without
URL-encoding:

```json
{
  "title": "Road trip",
  "track": [
    {
      "url": "Miles Davis/Kind of Blue/01 So What.mp3",
      "title": "So What",
      "artist": "Miles Davis",
      "album": "Kind of Blue",
      "length": "545000",
      "image": "Miles Davis/Kind of Blue/cover.jpg"
    },
    {
      "url": "ABBA/Arrival/01 Dancing Queen.mp3",
      "title": "Dancing Queen",
      "artist": "ABBA"
    }
  ]
}
```

### Uploading music

To upload one track with its metadata:

```sh
aws --endpoint-url "$S3ENDPOINT" s3 cp "01 Dancing Queen.mp3" \
  "s3://$S3BUCKET/ABBA/Arrival/01 Dancing Queen.mp3" \
  --content-type audio/mpeg \
  --metadata "artist=ABBA,album=Arrival,title=Dancing%20Queen,tracknumber=1,year=1976,length=230000,image=ABBA%2FArrival%2Fcover.jpg"
```

To upload a whole library, use a script that reads each file's tags. Here is
one that uses `ffprobe` (from [FFmpeg](https://ffmpeg.org/)) and Python. Save it
as `upload.sh` and run it in a folder organized as `Artist/Album/Track.mp3`. It
uses a `cover.jpg` next to the tracks as the album art, when there is one:

```sh
#!/bin/sh
# Uploads every .mp3 under the current folder, with its tags as metadata
upload() {
  file="${1#./}"
  tag() { ffprobe -v error -show_entries "format_tags=$1" -of default=nw=1:nk=1 "$file" | head -n 1; }
  enc() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
  ms=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" | awk '{printf "%d", $1 * 1000}')
  meta="artist=$(enc "$(tag artist)"),album=$(enc "$(tag album)"),title=$(enc "$(tag title)")"
  meta="$meta,tracknumber=$(enc "$(tag track)"),year=$(enc "$(tag date)"),genre=$(enc "$(tag genre)"),length=$ms"
  cover="$(dirname "$file")/cover.jpg"
  [ -f "$cover" ] && meta="$meta,image=$(enc "$cover")"
  aws --endpoint-url "$S3ENDPOINT" s3 cp "$file" "s3://$S3BUCKET/$file" \
    --content-type audio/mpeg --metadata "$meta"
}
find . -name '*.mp3' | while read -r f; do upload "$f"; done
```

Upload the album art and playlists with `aws s3 cp` or `aws s3 sync`:

```sh
aws --endpoint-url "$S3ENDPOINT" s3 sync . "s3://$S3BUCKET" \
  --exclude "*" --include "*/cover.jpg"
aws --endpoint-url "$S3ENDPOINT" s3 cp "Road trip.json" "s3://$S3BUCKET/" \
  --content-type application/json
```

The player keeps the metadata of tracks it has seen in the browser. After you
change the metadata of a track that's already uploaded, clear the site data of
the player in the browser to see the change.

### Allowing the browser to read the bucket (CORS)

The browser lets the app read the bucket only if the bucket allows it with a
CORS configuration. This is needed when the app is served from another address
than the bucket, and for the TV app. Save this as `cors.json`:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": [
        "x-amz-meta-artist", "x-amz-meta-album", "x-amz-meta-title",
        "x-amz-meta-name", "x-amz-meta-tracknumber", "x-amz-meta-length",
        "x-amz-meta-year", "x-amz-meta-recordingtime", "x-amz-meta-genre",
        "x-amz-meta-keywords", "x-amz-meta-image"
      ]
    }
  ]
}
```

and apply it:

```sh
aws --endpoint-url "$S3ENDPOINT" s3api put-bucket-cors --bucket "$S3BUCKET" \
  --cors-configuration file://cors.json
```

Every request is signed with your key, so allowing any origin doesn't make the
music public. You can replace `*` with the address of your copy of the app.

### Installing the web app

The latest version of the app is at
<https://audioplayer.ctrldash.app/>. It's built from the `main` branch
of this repository and published with GitHub Pages. Your keys and music still
go only between your browser and your bucket. Open the address, enter the
[settings](#settings), and you're done.

To host a copy of your own, building the app needs [Node.js](https://nodejs.org/) and this repository:

```sh
git clone https://github.com/samuelmr/audio-player.git
cd audio-player
npm install
npm run build:pwa
```

The app is in `dist/pwa`. Serve all of its files over HTTPS from any static
web host. Besides `audioplayer.js`, the build makes script chunks such as
`274.audioplayer.js`, which the app loads when it needs them.

You can also serve the app from the object storage. The AWS CLI sets each
file's content type from its extension:

```sh
aws --endpoint-url "$S3ENDPOINT" s3 cp dist/pwa "s3://$S3BUCKET/" --recursive
```

These files have to be publicly readable. Depending on your provider, add
`--acl public-read` to the command or make them public in the provider's
settings. Your music doesn't have to be public: the app reads it with your key.
The player doesn't need to be in the same bucket as the music files.

Open the address of the app (or of your `index.html`) in a browser. On a phone,
you can add it to the home screen (Share → *Add to Home Screen* on iOS, the
menu → *Install app* or *Add to Home screen* on Android) to use it like an app.

### Settings

The first time, the settings open by themselves. Later, open them with the ⚙
button.

| Setting | What to enter |
| --- | --- |
| S3 accessKeyId | The access key ID of your key |
| S3 secretAccessKey | The secret of your key |
| S3 endpoint | The address of the S3 service, without the bucket name, such as `https://eu2.contabostorage.com` or `https://s3.eu-north-1.amazonaws.com` |
| S3 region | The bucket's region, such as `eu-north-1`. If your provider has no regions, `us-east-1` usually works |
| S3 bucket | The name of the bucket |
| Player color | The base color of the player. Album art overrides it while a track plays |

*Save* stores the settings in this browser only. *Cancel* returns to the saved
settings.

To move the settings to another device, use *Transfer settings*:

- *Copy settings code* and *Paste settings code* move them through the
  clipboard.
- *Show QR code* shows them as a QR code, and *Scan QR code* reads one with
  the camera.

A home screen app on iOS has storage of its own, separate from Safari, so it
needs the settings too. The settings code contains your secret key, so don't
share it.

### Using the player

- Open the folders to browse, and press **+** to add a track, an album, or an
  artist to the queue. The playlists are under *Playlists* at the top.
- Search finds artists, albums, tracks and playlists in the whole bucket.
- *Save offline* saves what's in the queue as an offline playlist. Its tracks
  are downloaded in the background, and it can be played without a network.
- The address of the page follows what you add, such as
  `index.html#ABBA/Arrival`. Opening such an address adds that folder to the
  queue.
- On a computer, Space plays and pauses, ← and → move to the previous and next
  track, and ↑ and ↓ move in the queue.

## Using the player on a Samsung TV

The TV app is not in Samsung's app store. You build it yourself and install it
on your TV in developer mode, which takes some time the first time.

### Is my TV supported?

The app needs a Samsung TV with **Tizen 6.0 or later**, which means models from
**2021 on**. To check your TV:

1. On the TV, open *Settings* → *Support* → *About This TV*, and note the model
   code and the software version.
2. Find the model year of your model in Samsung's
   [TV model groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html)
   and its Tizen version in the
   [Tizen version specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html).
   The [web engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
   list the browser engine of each year.

The app has been made for 2021 TVs and later, but it hasn't been tried on every
model. If yours is one of them and the app doesn't work, please
[open an issue](#if-the-app-doesnt-work-on-your-tv).

### What you need for the TV

- A bucket with your music, set up as in
  [Using the player on a computer or phone](#using-the-player-on-a-computer-or-phone),
  including the [CORS configuration](#allowing-the-browser-to-read-the-bucket-cors).
- A computer on the same network as the TV, with [Node.js](https://nodejs.org/)
  and this repository (`git clone`, `npm install`).
- [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
  in its default location, `~/tizen-studio`. If it's elsewhere, set
  `TIZEN_STUDIO` to its folder. In Tizen Studio's *Package Manager*, install
  from *Extension SDK*:
  - **TV Extensions** (the newest version)
  - **Samsung Certificate Extension**
- A Samsung account, for the certificate that lets the app run on your TV.
- The SmartThings app on your phone, connected to the TV, for typing on the
  TV. It's optional, but much easier than the remote.

### 1. Turn on developer mode on the TV

1. Find your computer's IP address on the local network (on macOS, *System
   Settings* → *Network*; on Windows, `ipconfig`; on Linux, `ip addr`).
2. On the TV, open *Apps*.
3. Enter `1`, `2`, `3`, `4`, `5` with the remote. If the remote has no number
   keys, use the number pad that opens from its `123` key or from the screen.
4. In the *Developer Mode* window, turn developer mode **On**, enter your
   computer's IP address as the *Host PC IP*, and press *OK*.
5. Turn the TV off and on again, from the power plug if needed. *Developer
   Mode* is then shown at the top of *Apps*.
6. Note the TV's IP address, from *Settings* → *General* → *Network* →
   *Network Status* → *IP Settings*.

Samsung's guide has pictures of these steps:
[Connecting the TV and SDK](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

### 2. Create a Samsung certificate

The TV runs only apps signed with a certificate that names it.

1. In Tizen Studio, open *Tools* → *Device Manager*, add the TV by its IP
   address (*Remote Device Manager* → **+**) and connect to it.
2. Open *Tools* → *Certificate Manager*, and create a new certificate profile:
   - choose **Samsung** as the type and **TV** as the device type
   - create a new author certificate, and sign in with your Samsung account
   - create a new distributor certificate. With the TV connected, its DUID is
     filled in. Leave the privilege level at *Public*.
3. Make the new profile the active one.

Samsung's guide:
[Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

### 3. Build, sign and install the app

```sh
npm run package:tizen
TV_IP=192.168.1.20 npm run install:tv
```

`package:tizen` builds the app and signs `dist/tizen/CtrlMusic.wgt` with the
active certificate profile. `install:tv` connects to the TV and installs it.
Use your TV's address instead of `192.168.1.20`. *Ctrl music* is then among the
apps on the TV.

### 4. Enter the settings

Typing the keys with the remote is slow, so copy them from the web app:

1. In the web app on your phone, open the settings and press *Copy settings
   code*.
2. On the TV, open the app and its settings (⚙), and select the text field
   under *Transfer settings*.
3. Paste the code with the keyboard of the SmartThings app on your phone, and
   press *Import settings code*.

### Using the remote

- The arrow keys move around. Right opens a folder or playlist, Left closes it.
- OK or Play adds the selected item to the queue. Play also starts playing it.
- Play/Pause, Stop, Rewind and Fast-forward work as usual. The channel keys
  move to the next and previous track.
- Back goes up a level, and from the player buttons asks whether to exit.

### If the app doesn't work on your TV

Please [open an issue](https://github.com/samuelmr/audio-player/issues/new)
with:

- the TV's **model code**, and its **software version** (*Settings* →
  *Support* → *About This TV*)
- the **Tizen version**, if you can find it. With the TV connected, it's the
  `platform_version` line of
  `~/tizen-studio/tools/sdb capability`.
- the **version of the app**: the commit you built (`git rev-parse --short HEAD`)
- your **Tizen Studio** version and the **TV Extensions** version
- **what went wrong**: at which step, what you expected, and what happened
  instead
- the **complete output** of the commands that failed, such as
  `npm run package:tizen` or `npm run install:tv`
- if the app starts but doesn't work right, **errors from its console**, if you
  can get them: run the app in debug mode from Tizen Studio (right-click the
  project → *Debug As* → *Tizen Web Application*) and copy the errors from
  the *Console* tab of the developer tools
- your **S3 provider**, without your keys, bucket name or other secrets

Photos of the screen help too.

## Development and contributing

Contributions are welcome: bug reports, fixes, and new features.

### Getting started

You need [Node.js](https://nodejs.org/) (a current LTS version) and Git.

```sh
git clone https://github.com/samuelmr/audio-player.git
cd audio-player
npm install
npm run test:setup   # once: downloads the Chromium for the end-to-end tests
```

You don't need a bucket of your own to work on the app. The end-to-end tests
come with a fake S3 bucket and a small music library, which you can also use
by hand:

```sh
npm run build
node tests/e2e/server.js
```

Open <http://127.0.0.1:4173/pwa/>, and enter the settings from `SETTINGS` in
[`tests/e2e/library.js`](tests/e2e/library.js). `npm start` runs a development
server for the web app, which you can point at your own bucket.

The TV app needs [Tizen Studio](#what-you-need-for-the-tv) only for packaging it and
trying it on a TV.

### Layout

- `src/` has the code shared by both apps, and `src/platform/` what differs
  between them
- `pwa/` has the web app's HTML template, service worker, manifest and icon
- `tizen/` has the TV app's HTML template and `config.xml`
- `tests/` has the tests, see below

`npm run build` builds both apps, into `dist/pwa` and `dist/tizen`.

The TV app runs on Tizen 6.0 and later. The oldest of these TVs have
Chromium 76, so Babel compiles the TV app's script for it, and the stylesheets
avoid what it lacks (such as `gap` in flexbox, `inset` and `clamp()`).
`npm run test:build` checks this.

### Testing

Run `npm run check` before opening a pull request. It builds both apps and
runs every test that doesn't need Tizen Studio.

| Command | Needs | Tests |
| --- | --- | --- |
| `npm test` | Node | Unit tests of the source (`tests/unit`) |
| `npm run test:build` | Node | The built apps: their files, and that the TV app has nothing Chromium 76 lacks (`tests/build`) |
| `npm run test:pwa` | Node, Playwright's Chromium | The web app in Chromium (`tests/e2e/pwa`) |
| `npm run test:tv` | Node, Playwright's Chromium | The TV app in Chromium, worked with remote control keys (`tests/e2e/tv`) |
| `npm run check` | Node, Playwright's Chromium | All of the above |
| `npm run test:tizen` | Tizen Studio | Packages and signs the `.wgt` and checks it; with `TV_IP` set, installs and launches it on that TV |
| `npm run check:full` | Tizen Studio | `check` and `test:tizen` |

The end-to-end tests need no bucket or keys: `tests/e2e/server.js` serves the
built apps and a fake S3 bucket with the small library of
`tests/e2e/library.js`. The TV app gets stand-ins for the Tizen APIs it uses.
Chromium can't be as old as the oldest TVs, so the checks of `test:build`
stand in for running on them.

Left to be tried by hand on the devices: playback on a real TV and its remote,
a Tizen 6 TV, a home screen app on iOS in the background, and scanning a QR
code with a camera.

### Pull requests

1. Fork the repository and create a branch for your change.
2. Make the change in the style of the code around it, and add or update tests
   for it.
3. Run `npm run check`, and `npm run check:full` too if you changed the TV app
   and have Tizen Studio.
4. Open a pull request against `main`. Describe what you changed and why, how
   you tested it, and on which devices or browsers you tried it.

For bigger changes, open an issue first to talk about the idea.

### Trying a branch on your devices

Every branch pushed to this repository is built, tested and published in a
folder of its own: `my-test-branch` is at
`https://audioplayer.ctrldash.app/my-test-branch/`, and `feature/search` at
`/feature-search/` (slashes become dashes). Deleting the branch removes the
folder. `main` is at the root of the site.

The workflow, [`.github/workflows/pages.yml`](.github/workflows/pages.yml),
also works in a fork: in your fork's *Settings* → *Pages*, choose *Deploy from
a branch* and the `gh-pages` branch after the first push has created it. Your
copies are then at `https://<your-user>.github.io/audio-player/`.

The copies share the browser's storage with the app at the root of the same
site. They see its settings, offline playlists and metadata cache. A branch
that raises the version of the IndexedDB database in `src/db.js` leaves older
versions of the app unable to open it in that browser, so try such changes in
a private window or another browser profile.

The dependencies are kept at their latest versions. If an update breaks
something, fix the code rather than pinning an older version.

## License

[The Unlicense](LICENSE): this is free and unencumbered software released into
the public domain.
