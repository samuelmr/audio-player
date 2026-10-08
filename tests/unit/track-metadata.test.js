import { describe, test, expect } from 'vitest'
import { parseTrackNumber, replayGainVolume } from '../../src/track-metadata.js'

describe('the track number', () => {
  test('is a plain number as it is', () => {
    expect(parseTrackNumber('2')).toBe('2')
  })

  test('is the leading number of an old "number/total" tag', () => {
    expect(parseTrackNumber('11/16')).toBe('11')
  })

  test('loses its leading zeros', () => {
    expect(parseTrackNumber('02')).toBe('2')
  })

  test('is decoded, and may be a number', () => {
    expect(parseTrackNumber('%32')).toBe('2')
    expect(parseTrackNumber(7)).toBe('7')
  })

  test('is empty when missing', () => {
    expect(parseTrackNumber(undefined)).toBe('')
    expect(parseTrackNumber('')).toBe('')
  })

  test('stays as it is when it does not start with a number', () => {
    expect(parseTrackNumber('A1')).toBe('A1')
  })
})

describe('the ReplayGain volume', () => {
  test('is full without gain', () => {
    expect(replayGainVolume({})).toBe(1)
    expect(replayGainVolume(undefined)).toBe(1)
  })

  test('is lower for a negative gain', () => {
    expect(replayGainVolume({replaygaintrackgain: '-6'})).toBeCloseTo(0.501, 3)
    expect(replayGainVolume({replaygaintrackgain: '-7.23'})).toBeCloseTo(0.435, 3)
  })

  test('stays full when the track needs a boost', () => {
    expect(replayGainVolume({replaygaintrackgain: '3.5'})).toBe(1)
  })

  test('takes the track gain before the album gain', () => {
    expect(replayGainVolume({replaygaintrackgain: '-6', replaygainalbumgain: '-12'})).toBeCloseTo(0.501, 3)
    expect(replayGainVolume({replaygainalbumgain: '-12'})).toBeCloseTo(0.251, 3)
  })

  test('accepts a plus sign and a dB suffix', () => {
    expect(replayGainVolume({replaygaintrackgain: '-6.00 dB'})).toBeCloseTo(0.501, 3)
    expect(replayGainVolume({replaygaintrackgain: '+0.0'})).toBe(1)
  })

  test('ignores a value that is not a gain', () => {
    expect(replayGainVolume({replaygaintrackgain: 'loud', replaygainalbumgain: '-6'})).toBeCloseTo(0.501, 3)
    expect(replayGainVolume({replaygaintrackgain: 'loud'})).toBe(1)
  })
})
