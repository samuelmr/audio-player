// The music library served by the fake S3 (server.js), and the settings
// that point the apps at it. Nothing here is a real bucket or a real secret.

// TEST_PORT moves both, so that copies of the repo (such as git worktrees)
// can run the tests at the same time
export const APP_PORT = Number(process.env.TEST_PORT) || 4173
export const S3_PORT = APP_PORT + 1

export const SETTINGS = {
  accessKeyId: 'TESTACCESSKEY',
  secretAccessKey: 'test-secret-key',
  endpoint: `http://127.0.0.1:${S3_PORT}`,
  region: 'eu-test-1',
  bucketName: 'music',
}

// the same library in a public bucket, read without keys. Its name has a
// tenant in front, like the public buckets of some providers
export const PUBLIC_SETTINGS = {
  endpoint: SETTINGS.endpoint,
  bucketName: 'tenant:public-music',
}

// the ABBA tracks are short, to test moving on at the end of a track, and
// the Miles Davis ones long enough to seek in.
// meta becomes x-amz-meta-* headers, like the metadata of the real uploads;
// length is in milliseconds, as in the tags the uploads were made from
const track = (key, seconds, meta) => ({key, seconds, meta: {length: String(seconds * 1000), ...meta}})

export const TRACKS = [
  track('ABBA/Arrival/01 Dancing Queen.mp3', 2, {artist: 'ABBA', album: 'Arrival', title: 'Dancing Queen', tracknumber: '1', year: '1976'}),
  track('ABBA/Arrival/02 Knowing Me, Knowing You.mp3', 2, {artist: 'ABBA', album: 'Arrival', title: 'Knowing Me, Knowing You', tracknumber: '2', year: '1976'}),
  track('ABBA/Arrival/03 Money, Money, Money.mp3', 2, {artist: 'ABBA', album: 'Arrival', title: 'Money, Money, Money', tracknumber: '3', year: '1976'}),
  track('Björk/Debut/01 Human Behaviour.mp3', 2, {artist: 'Björk', album: 'Debut', title: 'Human Behaviour', tracknumber: '1', year: '1993'}),
  track('Miles Davis/Kind of Blue/01 So What.mp3', 30, {artist: 'Miles Davis', album: 'Kind of Blue', title: 'So What', tracknumber: '1', year: '1959', genre: 'Jazz', image: 'Miles Davis/Kind of Blue/cover.png'}),
  track('Miles Davis/Kind of Blue/02 Freddie Freeloader.mp3', 30, {artist: 'Miles Davis', album: 'Kind of Blue', title: 'Freddie Freeloader', tracknumber: '2', year: '1959', genre: 'Jazz', image: 'Miles Davis/Kind of Blue/cover.png'}),
]

// the album art of Kind of Blue: one color, from which the player takes its hue
export const COVER = {key: 'Miles Davis/Kind of Blue/cover.png', rgb: [30, 60, 200], hue: 229}

// at the root of the bucket, in the format of the playlists made for the app
export const PLAYLISTS = {
  'Road trip.json': {
    title: 'Road trip',
    track: [
      {url: 'Miles Davis/Kind of Blue/01 So What.mp3', title: 'So What', artist: 'Miles Davis', image: COVER.key},
      {url: 'ABBA/Arrival/01 Dancing Queen.mp3', title: 'Dancing Queen', artist: 'ABBA'},
    ],
  },
}

export const titleOf = (key) => TRACKS.find(t => t.key == key).meta.title
