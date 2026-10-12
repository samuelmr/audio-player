import { describe, test, expect } from 'vitest'
import { parseDuration, parsePlaylist, playlistBase, playlistTrack, playlistType } from '../../src/playlist.js'

describe('the duration of a schema.org track', () => {
  test('is in milliseconds', () => {
    expect(parseDuration('PT10M1S')).toBe('601000')
    expect(parseDuration('PT1H2M')).toBe('3720000')
    expect(parseDuration('PT3.5S')).toBe('3500')
  })

  test('is empty when it is not an ISO 8601 duration', () => {
    expect(parseDuration('')).toBe('')
    expect(parseDuration('PT')).toBe('')
    expect(parseDuration('10:01')).toBe('')
    expect(parseDuration(undefined)).toBe('')
  })
})

describe('a track of a .json playlist', () => {
  test('gets the keys of the app from the schema.org ones', () => {
    expect(playlistTrack({
      '@type': 'MusicRecording',
      byArtist: 'Isaac Hayes',
      duration: 'PT10M1S',
      inAlbum: 'The Best Of The Polydor Years',
      datePublished: '1977',
      position: '1',
      name: "Moonlight Lovin' (Menage A Trois)",
      url: "Isaac Hayes/The Best Of The Polydor Years/01 Moonlight Lovin' (Menage A Trois).mp3",
    })).toEqual({
      artist: 'Isaac Hayes',
      length: '601000',
      album: 'The Best Of The Polydor Years',
      datePublished: '1977',
      tracknumber: '1',
      name: "Moonlight Lovin' (Menage A Trois)",
      url: "Isaac Hayes/The Best Of The Polydor Years/01 Moonlight Lovin' (Menage A Trois).mp3",
    })
  })

  test('leaves out empty values, to be filled from the metadata', () => {
    expect(playlistTrack({duration: '', genre: '', url: 'a.mp3'})).toEqual({url: 'a.mp3'})
  })

  test('takes the name of an artist or album given as a thing', () => {
    expect(playlistTrack({byArtist: {'@type': 'MusicGroup', name: 'ABBA'}, inAlbum: {name: 'Arrival'}, url: 'a.mp3'}))
      .toEqual({artist: 'ABBA', album: 'Arrival', url: 'a.mp3'})
  })

  test('keeps the keys of the app over the schema.org ones', () => {
    expect(playlistTrack({artist: 'ABBA', byArtist: 'Abba', length: '1000', duration: 'PT2S', url: 'a.mp3'}))
      .toEqual({artist: 'ABBA', length: '1000', url: 'a.mp3'})
  })
})

describe('a .json playlist', () => {
  test('has the tracks that have a url', () => {
    const text = JSON.stringify({track: [{url: 'a.mp3', title: 'A'}, {title: 'No url'}, null, {url: 'b.mp3'}]})
    expect(parsePlaylist('List.json', text)).toEqual([{url: 'a.mp3', title: 'A'}, {url: 'b.mp3'}])
  })

  test('without tracks is empty', () => {
    expect(parsePlaylist('List.json', '{}')).toEqual([])
  })

  test('that is not JSON throws', () => {
    expect(() => parsePlaylist('List.json', 'not json')).toThrow()
  })
})

describe('an .m3u playlist', () => {
  test('has a track on each line, with the keys relative to its folder', () => {
    expect(parsePlaylist('Lists/Mix.m3u', '﻿ABBA/Arrival/01 Dancing Queen.mp3\r\n\r\n../Björk/Debut/01 Human Behaviour.mp3\n/KLF.mp3\n'))
      .toEqual([
        {url: 'Lists/ABBA/Arrival/01 Dancing Queen.mp3'},
        {url: 'Björk/Debut/01 Human Behaviour.mp3'},
        {url: 'KLF.mp3'},
      ])
  })

  test('takes the length, artist and title from an #EXTINF line', () => {
    const text = '#EXTM3U\n#EXTINF:601,Isaac Hayes - Moonlight Lovin\'\na.mp3\n#EXTINF:-1,Just a title\nb.mp3\nc.mp3\n'
    expect(parsePlaylist('Mix.m3u8', text)).toEqual([
      {url: 'a.mp3', length: '601000', artist: 'Isaac Hayes', title: 'Moonlight Lovin\''},
      {url: 'b.mp3', title: 'Just a title'},
      {url: 'c.mp3'},
    ])
  })

  test('leaves out the paths outside the bucket', () => {
    expect(parsePlaylist('Mix.m3u', 'https://example.com/a.mp3\nfile:///Music/b.mp3\n../c.mp3\nWindows\\d.mp3\n'))
      .toEqual([{url: 'Windows/d.mp3'}])
  })
})

describe('the type of a playlist', () => {
  test('is known from its key', () => {
    expect(playlistType('Road trip.json')).toBe('.json')
    expect(playlistType('Road trip.M3U')).toBe('.m3u')
    expect(playlistType('Road trip.m3u8')).toBe('.m3u8')
    expect(playlistType('Road trip.mp3')).toBeUndefined()
  })

  test('is left out of the name that playlists in two formats share', () => {
    expect(playlistBase('Road trip.json')).toBe('Road trip')
    expect(playlistBase('Road trip.m3u')).toBe('Road trip')
  })
})
