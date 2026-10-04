import { locale, translations, LANGUAGE_KEY } from './locale.js'
import { encodeSettings, decodeSettings } from './settings-code.js'

// addTransferControls comes from the platform: the ways of moving the
// settings code between devices differ between the PWA and the TV app
export function initSettings(player, { onSave, addTransferControls }) {
  const ss = document.createElement('dialog')
  ss.id = 'settings'
  ss.setAttribute('closedby', 'any')
  const gearBtn = document.createElement('button')
  gearBtn.className = 'gear'
  gearBtn.type = 'button'
  gearBtn.textContent = '⚙'
  gearBtn.onclick = () => ss.showModal()

  const settingsForm = document.createElement('form')
  settingsForm.method = 'dialog'

  const makeField = (id, labelText, type, autocompleteType, storageKey) => {
    const label = document.createElement('label')
    label.htmlFor = id
    label.textContent = labelText
    settingsForm.appendChild(label)
    const input = document.createElement('input')
    input.id = id
    input.type = type
    input.size = 40
    input.required = true
    input.autocomplete = autocompleteType
    input.value = localStorage.getItem(storageKey) || ''
    settingsForm.appendChild(input)
    return input
  }

  const accessKeyIdInput     = makeField('accessKeyIdInput',     locale.accessKeyId,     'text',     'on',               'accessKeyId')
  const secretAccessKeyInput = makeField('secretAccessKeyInput', locale.secretAccessKey, 'password', 'current-password', 'secretAccessKey')
  const endpointInput        = makeField('endpointInput',        locale.endpoint,        'text',     'url',              'endpoint')
  const regionInput          = makeField('regionInput',          locale.region,          'text',     'on',               'region')
  const bucketInput          = makeField('bucketInput',          locale.bucketName,      'text',     'on',               'bucketName')
  const playerColor          = makeField('playerColor',          locale.playerColor,     'range',    'off',              'playerColor')
  playerColor.min = 0
  playerColor.max = 360

  var style = window.getComputedStyle(document.body)
  console.log( style.getPropertyValue('--base-hue') )
  const defaultHue = style.getPropertyValue('--base-hue')
  playerColor.value = localStorage.getItem('playerColor') || defaultHue
  playerColor.oninput = playerColor.onchange = (e) => {
    playerColor.style.accentColor = `hsl(${e.target.value}, var(--base-saturation), calc(100% - var(--base-lightness)))`
    document.documentElement.style.setProperty('--base-hue', e.target.value);
  }

  // each language by its own name, as whoever needs to switch may not read the current one
  const languageLabel = document.createElement('label')
  languageLabel.htmlFor = 'languageSelect'
  languageLabel.textContent = locale.language
  settingsForm.appendChild(languageLabel)
  const languageSelect = document.createElement('select')
  languageSelect.id = 'languageSelect'
  languageSelect.add(new Option(locale.deviceLanguage, ''))
  for (const [code, translation] of Object.entries(translations)) {
    languageSelect.add(new Option(translation.languageName, code))
  }
  languageSelect.value = localStorage.getItem(LANGUAGE_KEY) || ''
  settingsForm.appendChild(languageSelect)

  const submit = document.createElement('input')
  submit.type = 'submit'
  submit.value = locale.save
  // submit.setAttribute('commandfor', 'settings')
  // submit.setAttribute('command', 'close')
  const reset = document.createElement('input')
  reset.type = 'reset'
  reset.value = locale.reset
  const formButtons = document.createElement('div')
  formButtons.className = 'buttons'
  formButtons.appendChild(submit)
  formButtons.appendChild(reset)
  settingsForm.appendChild(formButtons)

  const settingsError = document.createElement('div')
  settingsError.className = 'error'
  settingsForm.appendChild(settingsError)

  const settingsInputs = {
    accessKeyId: accessKeyIdInput,
    secretAccessKey: secretAccessKeyInput,
    endpoint: endpointInput,
    region: regionInput,
    bucketName: bucketInput,
    playerColor: playerColor,
    [LANGUAGE_KEY]: languageSelect
  }

  function exportCode() {
    const settings = {}
    for (const [key, input] of Object.entries(settingsInputs)) {
      settings[key] = input.value
    }
    return encodeSettings(settings)
  }

  function importCode(code) {
    const settings = decodeSettings(code)
    for (const [key, input] of Object.entries(settingsInputs)) {
      if (typeof settings[key] === 'string') {
        input.value = settings[key]
      }
    }
    playerColor.dispatchEvent(new Event('input'))
    settingsForm.requestSubmit()
  }

  const transfer = document.createElement('fieldset')
  transfer.className = 'transfer'
  const transferLegend = document.createElement('legend')
  transferLegend.textContent = locale.transferTitle
  transfer.appendChild(transferLegend)

  const setMessage = (text) => {
    settingsError.textContent = text
  }

  const addButton = (text, onclick) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.onclick = async () => {
      try {
        settingsError.textContent = ''
        await onclick(button)
      } catch(e) {
        settingsError.textContent = e.message || e.toString()
      }
    }
    transfer.appendChild(button)
    return button
  }

  addTransferControls({ dialog: ss, container: transfer, addButton, exportCode, importCode, setMessage })

  // native reset would empty the fields, so restore the saved values instead
  settingsForm.onreset = (e) => {
    e.preventDefault()
    for (const [key, input] of Object.entries(settingsInputs)) {
      input.value = localStorage.getItem(key) || ''
    }
    playerColor.value = localStorage.getItem('playerColor') || defaultHue
    playerColor.dispatchEvent(new Event('input'))
    settingsError.textContent = ''
    ss.close()
  }

  settingsForm.onsubmit = (e) => {
    e.preventDefault()
    localStorage.setItem('accessKeyId', accessKeyIdInput.value)
    localStorage.setItem('secretAccessKey', secretAccessKeyInput.value)
    localStorage.setItem('endpoint', endpointInput.value)
    localStorage.setItem('region', regionInput.value)
    localStorage.setItem('bucketName', bucketInput.value)
    localStorage.setItem('playerColor', playerColor.value)
    // the texts are set as the app starts, so a new language needs a restart
    if (languageSelect.value != (localStorage.getItem(LANGUAGE_KEY) || '')) {
      localStorage.setItem(LANGUAGE_KEY, languageSelect.value)
      location.reload()
      return
    }
    try {
      onSave()
      settingsError.textContent = ''
      // ss.classList.remove('open')
      ss.close()
    } catch(e) {
      settingsError.textContent = e.toString()
    }
  }
  ss.appendChild(settingsForm)
  ss.appendChild(transfer)
  document.body.appendChild(ss)
  player.appendChild(gearBtn)

  return {
    showError(e) {
      // ss.classList.add('open')
      ss.showModal()
      settingsError.textContent = e.toString()
    }
  }
}
