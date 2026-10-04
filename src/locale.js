import en from './i18n/en.js'
import fi from './i18n/fi.js'

// To add a language, copy i18n/en.js, translate it, and list it here.
// All of them are bundled: the TV app is a single script.
export const translations = { en, fi }

// the stored choice; none (or '') follows the device's language
export const LANGUAGE_KEY = 'language'

function storedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY)
  } catch(e) {
    return null // not in a browser, as in the unit tests
  }
}

function pickLanguage() {
  const stored = storedLanguage()
  const nav = globalThis.navigator || {}
  const wanted = stored ? [stored] : nav.languages || [nav.language]
  for (const tag of wanted) {
    // 'fi-FI' -> 'fi'
    const base = (tag || '').toLowerCase().split('-')[0]
    if (base in translations) {
      return base
    }
  }
  return 'en'
}

export const language = pickLanguage()

// missing translations fall back to English
export const locale = {...en, ...translations[language]}

if (typeof document != 'undefined') {
  document.documentElement.lang = language
}
