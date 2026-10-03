import { describe, test, expect } from 'vitest'
import { encodeSettings, decodeSettings, SETTINGS_CODE_PREFIX } from '../../src/settings-code.js'

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
    expect(() => decodeSettings(code)).toThrow('Not a valid settings code')
  })
})
