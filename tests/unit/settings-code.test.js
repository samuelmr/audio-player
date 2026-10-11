import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { encodeSettings, decodeSettings, settingsLink, isSettingsCode, applySettingsLink, SETTINGS_CODE_PREFIX } from '../../src/settings-code.js'
import { locale } from '../../src/locale.js'

const settings = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalr/XUtnFEMI+K7MDENG',
  endpoint: 'https://s3.example.com',
  region: 'eu-north-1',
  bucketName: 'music',
  playerColor: '180',
}

describe('settings codes', () => {
  test('round-trip the settings', () => {
    const code = encodeSettings(settings)
    expect(code.startsWith(SETTINGS_CODE_PREFIX)).toBe(true)
    expect(decodeSettings(code)).toEqual(settings)
  })

  test('keep text beyond ASCII', () => {
    const unicode = {...settings, bucketName: 'musiikki-äö', secretAccessKey: 'ключ€🎵'}
    expect(decodeSettings(encodeSettings(unicode))).toEqual(unicode)
  })

  // the format is shared between versions of the apps on different devices
  test('are base64 of UTF-8 JSON', () => {
    const code = SETTINGS_CODE_PREFIX + Buffer.from(JSON.stringify(settings)).toString('base64')
    expect(encodeSettings(settings)).toBe(code)
  })

  test('may have whitespace around them, as pasted', () => {
    expect(decodeSettings(`  ${encodeSettings(settings)}\n`)).toEqual(settings)
  })

  test.each([
    ['nothing', undefined],
    ['an empty code', ''],
    ['a code without the prefix', Buffer.from(JSON.stringify(settings)).toString('base64')],
    ['a code that is not base64', `${SETTINGS_CODE_PREFIX}not base64!`],
    ['a code that is not JSON', SETTINGS_CODE_PREFIX + btoa('{nope')],
  ])('reject %s', (_, code) => {
    expect(() => decodeSettings(code)).toThrow(locale.invalidCode)
  })

  test('are read from a link as well', () => {
    const link = settingsLink(encodeSettings(settings), 'https://player.example.com/branch/?folder=ABBA#old')
    expect(decodeSettings(link)).toEqual(settings)
    expect(isSettingsCode(link)).toBe(true)
    expect(isSettingsCode('https://player.example.com/')).toBe(false)
  })
})

describe('settings links', () => {
  test('keep the code in the fragment, and the query out', () => {
    const link = new URL(settingsLink(encodeSettings(settings), 'https://player.example.com/branch/?folder=ABBA'))
    expect(link.origin + link.pathname).toBe('https://player.example.com/branch/')
    expect(link.search).toBe('')
    expect(link.hash.startsWith('#settings=')).toBe(true)
  })

  describe('opened in the player', () => {
    let store
    beforeEach(() => {
      store = new Map()
      vi.stubGlobal('localStorage', {setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null})
      vi.stubGlobal('history', {replaceState: vi.fn()})
      vi.stubGlobal('location', {pathname: '/branch/', search: '?folder=ABBA'})
    })
    afterEach(() => vi.unstubAllGlobals())

    test('store the settings and leave the address without them', () => {
      const hash = new URL(settingsLink(encodeSettings({...settings, other: 'x'}), 'https://player.example.com/')).hash
      expect(applySettingsLink(hash)).toBe(true)
      expect(Object.fromEntries(store)).toEqual(settings)
      expect(history.replaceState).toHaveBeenCalledWith(null, '', '/branch/?folder=ABBA')
    })

    test('do nothing without a link', () => {
      expect(applySettingsLink('')).toBe(false)
      expect(applySettingsLink('#other')).toBe(false)
      expect(store.size).toBe(0)
    })

    test('reject an invalid code, and still clear the address', () => {
      expect(() => applySettingsLink('#settings=nonsense')).toThrow(locale.invalidCode)
      expect(store.size).toBe(0)
      expect(history.replaceState).toHaveBeenCalled()
    })
  })
})
