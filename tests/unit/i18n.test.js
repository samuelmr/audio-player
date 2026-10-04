import { describe, test, expect } from 'vitest'
import { translations } from '../../src/locale.js'

const { en, ...others } = translations

describe.each(Object.entries(others))('the %s translation', (code, translation) => {
  test('has every English text', () => {
    expect(Object.keys(translation).sort()).toEqual(Object.keys(en).sort())
  })

  test('has functions where English has them, taking the same values', () => {
    for (const [key, text] of Object.entries(en)) {
      expect(typeof translation[key], key).toBe(typeof text)
      if (typeof text == 'function') {
        expect(translation[key].length, key).toBe(text.length)
      }
    }
  })
})
