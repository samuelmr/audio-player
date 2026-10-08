import { describe, test, expect } from 'vitest'
import { folderSortName, trackYear, earlierYear, sortByKey, sortByName, shortcutLetter } from '../../src/library-order.js'

const record = (key, meta) => ({key, ...meta})

describe('the sort name of an artist folder', () => {
  test('is the albumartistsort of a track in it', () => {
    const records = [
      record('The Beatles/Help!/01 Help!.mp3', {artistsort: 'Beatles, The'}),
      record('The Beatles/Abbey Road/01 Come Together.mp3', {albumartistsort: 'Beatles, The (band)'}),
    ]
    expect(folderSortName('The Beatles', records)).toBe('Beatles, The (band)')
  })

  test('is the artistsort when the tracks agree on it', () => {
    const records = [
      record('The Beatles/Help!/01 Help!.mp3', {artistsort: 'Beatles, The'}),
      record('The Beatles/Help!/02 The Night Before.mp3', {artistsort: 'Beatles, The'}),
    ]
    expect(folderSortName('The Beatles', records)).toBe('Beatles, The')
  })

  test('is the folder name when the artistsorts differ, or there are none', () => {
    const records = [
      record('Various/Hits/01 One.mp3', {artistsort: 'Abba'}),
      record('Various/Hits/02 Two.mp3', {artistsort: 'Zappa, Frank'}),
      record('Other/Album/01 One.mp3', {artist: 'Other'}),
    ]
    expect(folderSortName('Various', records)).toBe('Various')
    expect(folderSortName('Other', records)).toBe('Other')
  })

  test('counts only the tracks in the folder, not in one whose name begins the same', () => {
    const records = [record('ABBA Tribute/Album/01 One.mp3', {artistsort: 'Tribute'})]
    expect(folderSortName('ABBA', records)).toBe('ABBA')
  })

  test('is decoded, and the first of several values', () => {
    const records = [record('Björk/Debut/01 Human Behaviour.mp3', {artistsort: 'Gu%C3%B0mundsd%C3%B3ttir%2C%20Bj%C3%B6rk; Other'})]
    expect(folderSortName('Björk', records)).toBe('Guðmundsdóttir, Björk')
  })
})

describe('the year of a track', () => {
  test('is the original release year before the year', () => {
    expect(trackYear({originaldate: '1969-01-12', year: '1994'})).toBe('1969')
    expect(trackYear({year: '1994'})).toBe('1994')
  })

  test('is empty without a year', () => {
    expect(trackYear({})).toBe('')
    expect(trackYear({year: 'unknown'})).toBe('')
    expect(trackYear(undefined)).toBe('')
  })

  test('of an album is the earliest one', () => {
    expect(earlierYear('1994', '1969')).toBe('1969')
    expect(earlierYear('', '1969')).toBe('1969')
    expect(earlierYear(undefined, '')).toBe('')
  })
})

describe('sorting', () => {
  test('ignores case and accents, and orders numbers by value', () => {
    expect(sortByKey(['b', 'Á', 'a 10', 'a 9'], x => x)).toEqual(['Á', 'a 9', 'a 10', 'b'])
  })

  test('puts the items without a key last, in the order they had', () => {
    expect(sortByKey(['z', 'y', '1994', '1969'], x => x.match(/\d/) ? x : '')).toEqual(['1969', '1994', 'z', 'y'])
  })

  test('by name keeps the order of the bucket, capitals first', () => {
    expect(sortByName(['abba', 'Björk', 'ABBA'], x => x)).toEqual(['ABBA', 'Björk', 'abba'])
  })
})

describe('the shortcut of a name', () => {
  test('is its first letter, and the same for every digit', () => {
    expect(shortcutLetter('ABBA')).toBe('A')
    expect(shortcutLetter('abba')).toBe('a')
    expect(shortcutLetter('2Pac')).toBe('1')
  })

  test('is a capital for a sort name', () => {
    expect(shortcutLetter('the Beatles', true)).toBe('T')
  })
})
