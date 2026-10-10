import { describe, test, expect } from 'vitest'
import { parseAddress, buildAddress } from '../../src/address.js'

describe('the address of the queue', () => {
  test('has each source under its own name, in queue order', () => {
    expect(buildAddress([['folder', 'ABBA'], ['song', 'a/b.mp3'], ['playlist', 'p.json'], ['folder', 'Björk']]))
      .toBe('?folder=ABBA&track=a%2Fb.mp3&playlist=p.json&folder=Bj%C3%B6rk')
  })

  test('is empty for an empty queue, and leaves out offline playlists', () => {
    expect(buildAddress([])).toBe('')
    expect(buildAddress([['playlist', 'offline:3']])).toBe('')
  })

  test('is read back as it was written, also with commas, ampersands and hashes', () => {
    const keys = ['A, B/C & D/#1.mp3', 'x=y/z.mp3']
    const linked = parseAddress(buildAddress(keys.map(key => ['song', key])))
    expect([...linked.song]).toEqual(keys)
  })

  test('ignores what it does not know, and empty values', () => {
    const linked = parseAddress('?folder=&other=1&playlist=p.json')
    expect([...linked.folder]).toEqual([])
    expect([...linked.song]).toEqual([])
    expect([...linked.playlist]).toEqual(['p.json'])
  })
})
