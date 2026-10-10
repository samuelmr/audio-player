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
  A key that can only read is enough, and the safest choice. A
  [public bucket](#a-public-bucket) needs no key.
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
| `tracknumber` | Track number. A tag such as `11/16` counts as `11` |
| `length` | Duration in **milliseconds** |
| `year` | Year (`recordingtime` also works) |
| `originaldate` | Original release date, `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Orders the albums by year (see [Settings](#settings)) before `year` |
| `artistsort`, `albumartistsort` | The name an artist is sorted by, such as `Beatles, The`. Orders the artists by sort name (see [Settings](#settings)) |
| `genre` | Genre |
| `keywords` | Keywords |
| `replaygaintrackgain`, `replaygainalbumgain` | [ReplayGain](https://en.wikipedia.org/wiki/ReplayGain) in dB, such as `-7.23`. The player lowers the volume of a loud track to match (the track gain first, then the album gain). It never raises it, and browsers that don't let a page set the volume, such as Safari on iPhone, play it as it is |
| `image` | Key of the album art in the same bucket, such as `ABBA/Arrival/cover.jpg` |

S3 stores metadata as `x-amz-meta-*` headers, which can only hold ASCII text.
The player URL-decodes every value, so **URL-encode the values** when uploading
(`Björk` → `Bj%C3%B6rk`). Plain ASCII values without a `%` work as they are.
A key with several values separates them with `; `; the player sorts by the
first.

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

To upload a whole library, use [`scripts/upload.sh`](scripts/upload.sh). It
reads the tags of each file with `ffprobe` (from [FFmpeg](https://ffmpeg.org/))
and uploads them as the metadata. A `cover.jpg` next to the tracks is uploaded
too, and becomes their album art.

Run it in the folder that has the artist folders: the path of each file under
it becomes its key in the bucket. Name folders to upload only those:

```sh
cd /path/to/your/music
/path/to/audio-player/scripts/upload.sh                    # everything
/path/to/audio-player/scripts/upload.sh "ABBA/Arrival"     # one album
```

It needs `S3BUCKET` and `S3ENDPOINT` set, and tells you how if they aren't.

Upload playlists with `aws s3 cp`:

```sh
aws --endpoint-url "$S3ENDPOINT" s3 cp "Road trip.json" "s3://$S3BUCKET/" \
  --content-type application/json
```

The player keeps the metadata of the tracks it has seen in the browser, and
fetches it again when a track has been uploaded again since.

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

### A public bucket

The player can also read a public bucket, such as one for others to try the
player with. Leave the keys empty in the [settings](#settings), and the player
reads the bucket without signing its requests. Anyone can then play the music,
so put in it only music that you may share.

Making a bucket public usually lets anyone read its files, but not list them,
and the player needs the list. Allow listing with a bucket policy. Save this
as `policy.json`, with your bucket's name in place of `demo-music`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Principal": "*", "Action": ["s3:GetObject"], "Resource": ["arn:aws:s3:::demo-music/*"]},
    {"Effect": "Allow", "Principal": "*", "Action": ["s3:ListBucket"], "Resource": ["arn:aws:s3:::demo-music"]}
  ]
}
```

and apply it, after checking with `get-bucket-policy` that it doesn't replace
a policy you need:

```sh
aws --endpoint-url "$S3ENDPOINT" s3api put-bucket-policy --bucket "$S3BUCKET" \
  --policy file://policy.json
```

The bucket needs the [CORS configuration](#allowing-the-browser-to-read-the-bucket-cors)
too. Some providers give a public bucket an address of its own: Contabo's is
like `https://eu2.contabostorage.com/<tenant>:demo-music`. Then the endpoint
is the part before the last `/`, and the bucket's name is the rest,
`<tenant>:demo-music`.

### Installing the web app

The latest version of the app is at
<https://audioplayer.ctrldash.app/>. It's built from the `main` branch
of this repository and published with GitHub Pages. Your keys and music still
go only between your browser and your bucket. Open the address, enter the
[settings](#settings), and you're done. The
[privacy policy](https://audioplayer.ctrldash.app/privacy.html) says the same
for everyone else; it's `pwa/privacy.html`, published with the app.

To host a copy of your own, building the app needs [Node.js](https://nodejs.org/) and this repository:

```sh
git clone https://github.com/samuelmr/audio-player.git
cd audio-player
npm install
npm run build:pwa
```

To give the app a default bucket, set `DEFAULT_BUCKET_URL` to the address of
a [public bucket](#a-public-bucket) when building:

```sh
DEFAULT_BUCKET_URL="https://s3.example.com/demo-music" npm run build:pwa
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
| S3 accessKeyId | The access key ID of your key. Empty for a [public bucket](#a-public-bucket) |
| S3 secretAccessKey | The secret of your key. Empty for a public bucket |
| S3 endpoint | The address of the S3 service, without the bucket name, such as `https://eu2.contabostorage.com` or `https://s3.eu-north-1.amazonaws.com` |
| S3 region | The bucket's region, such as `eu-north-1`. If it's empty, the player uses `us-east-1`, which usually works when your provider has no regions |
| S3 bucket | The name of the bucket |
| Player color | The base color of the player. Album art overrides it while a track plays |
| Library order | The order of the folders. *Folder names* is the order of the bucket. *Artist sort names* orders the artists by their `albumartistsort` or `artistsort`, so that *The Beatles* can be under B, and *Artist sort names, albums by year* also orders each artist's albums by `originaldate` or `year`. An artist whose tracks the player hasn't seen yet is sorted by its folder name, until a library scan |
| Language | The language of the player. *Device language* follows the language of the browser or TV, and falls back to English. Changing it restarts the player |

*Save* stores the settings in this browser only. *Cancel* returns to the saved
settings.

The player learns the metadata of the tracks as you open folders and search,
and keeps it in the browser. *Scan library* reads the metadata of every track
in the bucket at once, so that the library order knows all of them. It makes a
request for each track it hasn't read before, or that has changed since, so it
takes a while in a large library; it shows how far it has got, and *Stop scan*
stops it. *Clear local data* deletes the metadata the player has stored on
this device; the bucket and the offline playlists are not touched. When you
save a new endpoint, region or bucket name while there is stored metadata, the
player asks whether to clear it, as it may not match the new bucket: *Clear
local data* clears it and saves the settings, *Keep old settings* works like
*Cancel*, and *Edit settings* returns to the dialog with the settings unsaved.
A new endpoint, region or bucket name also empties the queue, except for the
offline playlists in it.

A copy of the app can be built with a default bucket (see
[Installing the web app](#installing-the-web-app)). Its endpoint and name show
in the empty fields, and the player uses them until you enter your own. The
app at <https://audioplayer.ctrldash.app/> has a public bucket of free music
as its default, so it plays something before you enter any settings.
[demo-music.md](demo-music.md) tells where that music comes from and under
what licence.

To move the settings to another device, use *Transfer settings* at the top:

- *Copy settings code* and *Paste settings code* move them through the
  clipboard.
- *Show QR code* shows them as a QR code, and *Scan QR code* reads one with
  the camera.

A home screen app on iOS has storage of its own, separate from Safari, so it
needs the settings too. The settings code contains your secret key, so don't
share it.

### Using the player

- Click or tap a folder, such as an artist or an album, to open and close
  it. Its first row, *Add all tracks to queue*, adds all of it. Click or tap
  a track or a playlist to add it to the queue. The playlists are under
  *Playlists* at the top.
- Search finds artists, albums, tracks and playlists in the whole bucket.
- The queue is under the player. Its first row, *Queue*, folds it away to
  show only the next track, and opens it again.
- *Save offline*, beside the queue's first row, saves what's in the queue as an offline playlist. Its tracks
  are downloaded in the background, and it can be played without a network.
- The address of the page follows the queue, such as
  `index.html?folder=ABBA/Arrival&track=Miles%20Davis/So%20What.mp3&playlist=Road%20trip.json`
  (`folder`, `track` and `playlist` can each be repeated). Opening such an
  address adds those to the queue. Offline playlists are not in the address.
- The button at the top right, or a tap on the album art, opens *Now
  Playing* over the whole window; on a computer, the button also makes the
  browser full screen. Its own button at the top right, or Esc, closes it.
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
- The queue is the row under the player: Right or OK expands it. OK on the
  playing track at the top opens *Now Playing* over the whole screen, which
  also opens by itself after 20 seconds without input during playback.
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
  between them. `src/styles.css` is the look of both; each app's HTML
  template adds its own: hover and touch in the web app, the remote's focus
  and the larger text in the TV app. The TV loads `src/styles.css` too, so it
  must work on Chromium 76.
- `src/i18n/` has the translations, see [Translating](#translating)
- `pwa/` has the web app's HTML template, service worker, manifest and icon
  (`icon.svg` is the source of `play-192.png` and `play-512.png`: `rsvg-convert -w 192 -h 192 pwa/icon.svg -o pwa/play-192.png`, and likewise with 512)
- `tizen/` has the TV app's HTML template and `config.xml`
- `scripts/` has the script for uploading music, and one for driving the TV
  app on a TV (see [Testing](#testing))
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

The tests serve the apps on port 4173 and the fake bucket on 4174. To run them
in two copies of the repository at once, such as two git worktrees, give one
of them other ports: `TEST_PORT=4273 npm run check` uses 4273 and 4274.

To try a change on a real TV, install it with `npm run install:tv`, and
[`scripts/tv-debug.js`](scripts/tv-debug.js) can then press the keys of the
remote, run JavaScript in the app and take screenshots:

```sh
TV_IP=192.168.1.20 node scripts/tv-debug.js --launch key:ArrowDown key:Enter shot:tv.png
```

Left to be tried by hand on the devices: playback on a real TV and its remote,
a Tizen 6 TV, a home screen app on iOS in the background, and scanning a QR
code with a camera.

### Ideas for later

- Searching by a metadata key, such as `mood:calm` for a `mood` key, perhaps
  in a view of its own for advanced searches.

### Pull requests

1. Fork the repository and create a branch for your change.
2. Make the change in the style of the code around it, and add or update tests
   for it.
3. Run `npm run check`, and `npm run check:full` too if you changed the TV app
   and have Tizen Studio.
4. Open a pull request against `main`. Describe what you changed and why, how
   you tested it, and on which devices or browsers you tried it.

For bigger changes, open an issue first to talk about the idea.

### Translating

The texts of both apps are in [`src/i18n/`](src/i18n/), one file per language.
[`en.js`](src/i18n/en.js) is the original, and anything missing from another
language is shown in English.

To add a language:

1. Copy `src/i18n/en.js` to a file named with the language's two-letter
   [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes),
   such as `src/i18n/sv.js`.
2. Translate the texts. Set `languageName` to the name of the language in that
   language itself (`Svenska`, not `Swedish`), as it's what the *Language*
   setting lists.
3. Add the language to `translations` in [`src/locale.js`](src/locale.js):

   ```js
   import sv from './i18n/sv.js'

   export const translations = { en, fi, sv }
   ```
4. Run `npm run check`. `tests/unit/i18n.test.js` checks that the new file has
   every text of `en.js`.

Texts with names or numbers in them are functions, so that each language can
put the words in its own order and use its own plurals:

```js
added: (name, count) => `Lisätty ${name}: ${count} ${count == 1 ? 'kappale' : 'kappaletta'}`,
```

Keep the function's parameters as they are in `en.js`, and change only the text
it returns.

To try a translation, choose the language in the settings, or set the language
of your browser to it and choose *Device language*. Look at the TV app too, as
its texts are larger and longer translations may not fit: after
`npm run build`, `node tests/e2e/server.js` serves it at
<http://127.0.0.1:4173/tizen/>.

When you add a text to the code, add it to `en.js` and to every other
language, in English if you can't translate it.

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

The published copies get a default bucket from the repository variable
`DEFAULT_BUCKET_URL` (*Settings* → *Secrets and variables* → *Actions* →
*Variables*), if it's set. The tests run without it.

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
