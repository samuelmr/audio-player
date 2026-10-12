// Reading the playlists in the bucket (see "Playlists" in the README): the
// .json playlists made for the app, the same in schema.org's MusicPlaylist
// format, and .m3u lists of tracks. Each track comes out with the metadata
// keys of the app, and the key of the track in the bucket as its url.

// the formats of a playlist, in the order of preference: of playlists with
// the same name, the player lists the first one
export const PLAYLIST_TYPES = ['.json', '.m3u', '.m3u8']

export const playlistType = (key) => PLAYLIST_TYPES.find(type => key.toLowerCase().endsWith(type))

// the key without its type, which is the same for a playlist in two formats
export const playlistBase = (key) => key.slice(0, key.length - (playlistType(key)?.length ?? 0))

// The milliseconds of an ISO 8601 duration such as "PT10M1S", or '' when the
// value isn't one
export function parseDuration(value) {
  const match = String(value ?? '').trim().match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (!match || !(match[1] || match[2] || match[3])) return ''
  const [hours, minutes, seconds] = match.slice(1).map(n => parseFloat(n || 0))
  return String(Math.round(1000 * (3600 * hours + 60 * minutes + seconds)))
}

// a schema.org value may be a thing with a name instead of the name
const nameOf = (value) => typeof value == 'object' ? value?.name : value

// The schema.org keys and the metadata keys they stand for. name,
// datePublished, genre and keywords are read as they are.
const SCHEMA_KEYS = {
  byArtist: 'artist',
  inAlbum: 'album',
  position: 'tracknumber',
}

// A track of a .json playlist with the keys of the app. Empty values are left
// out, so that the metadata of the track in the bucket fills them.
export function playlistTrack(entry) {
  const track = {}
  for (const [key, value] of Object.entries(entry ?? {})) {
    if (value == null || value === '' || key.startsWith('@')) continue
    if (key == 'duration') {
      const length = parseDuration(value)
      if (length) track.length = length
    }
    else if (SCHEMA_KEYS[key]) {
      const name = nameOf(value)
      if (name != null && name !== '') track[SCHEMA_KEYS[key]] = String(name)
    }
    else {
      track[key] = value
    }
  }
  // the app's own keys win over the schema.org ones
  for (const [key, own] of Object.entries(SCHEMA_KEYS)) {
    if (entry?.[own] != null && entry[own] !== '') track[own] = entry[own]
  }
  if (entry?.length != null && entry.length !== '') track.length = entry.length
  return track
}

// The key in the bucket of a path in an .m3u playlist, relative to the folder
// of the playlist. A path outside the bucket, such as a web address or one
// above its top, is left out.
function m3uKey(path, playlistKey) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null
  const parts = playlistKey.split('/').slice(0, -1)
  if (path.startsWith('/')) parts.length = 0
  for (const part of path.split(/[\/\\]/)) {
    if (part == '..') {
      if (!parts.length) return null
      parts.pop()
    }
    else if (part && part != '.') {
      parts.push(part)
    }
  }
  return parts.join('/')
}

// The tracks of an .m3u playlist: a path on each line. An #EXTINF line before
// one gives its length in seconds and "Artist - Title".
function parseM3u(text, key) {
  const tracks = []
  let info = null
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/).map(line => line.trim())) {
    if (!line) continue
    const extinf = line.match(/^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i)
    if (extinf) {
      info = {}
      const seconds = parseFloat(extinf[1])
      if (seconds > 0) info.length = String(Math.round(seconds * 1000))
      const name = extinf[2].trim()
      const at = name.indexOf(' - ')
      if (at > 0) {
        info.artist = name.slice(0, at).trim()
        info.title = name.slice(at + 3).trim()
      }
      else if (name) {
        info.title = name
      }
      continue
    }
    if (line.startsWith('#')) continue
    const url = m3uKey(line, key)
    if (url) tracks.push({url, ...info})
    info = null
  }
  return tracks
}

// The tracks of the playlist with this key, from its text. Throws when a
// .json playlist isn't JSON.
export function parsePlaylist(key, text) {
  const type = playlistType(key)
  if (type == '.m3u' || type == '.m3u8') return parseM3u(text, key)
  const playlist = JSON.parse(text)
  return (Array.isArray(playlist?.track) ? playlist.track : [])
    .filter(entry => typeof entry?.url == 'string' && entry.url)
    .map(playlistTrack)
}
