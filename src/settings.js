import { locale, translations, LANGUAGE_KEY } from './locale.js'
import { encodeSettings, decodeSettings } from './settings-code.js'
import { DEFAULTS, setting } from './defaults.js'
import { SORT_KEY, SORT_NAME, SORT_NAME_YEAR } from './library-order.js'

// addTransferControls comes from the platform: the ways of moving the
// settings code between devices differ between the PWA and the TV app.
// scanLibrary and stopLibraryScan run the library scan (scan.js).
// hasLocalData tells whether there is cached metadata, and clearLocalData
// deletes it (the bucket is not touched).
export function initSettings(player, { onSave, addTransferControls, scanLibrary, stopLibraryScan, hasLocalData, clearLocalData }) {
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

  // a default shows as the placeholder, and an empty field uses it
  const makeField = (id, labelText, type, autocompleteType, storageKey, required = true) => {
    const label = document.createElement('label')
    label.htmlFor = id
    label.textContent = labelText
    settingsForm.appendChild(label)
    const input = document.createElement('input')
    input.id = id
    input.type = type
    input.size = 40
    input.required = required && !DEFAULTS[storageKey]
    if (DEFAULTS[storageKey]) {
      input.placeholder = DEFAULTS[storageKey]
    }
    input.autocomplete = autocompleteType
    input.value = localStorage.getItem(storageKey) || ''
    settingsForm.appendChild(input)
    return input
  }

  // without keys the bucket is read as a public one
  const accessKeyIdInput     = makeField('accessKeyIdInput',     locale.accessKeyId,     'text',     'on',               'accessKeyId', false)
  const secretAccessKeyInput = makeField('secretAccessKeyInput', locale.secretAccessKey, 'password', 'current-password', 'secretAccessKey', false)
  accessKeyIdInput.placeholder = secretAccessKeyInput.placeholder = locale.publicBucket
  const endpointInput        = makeField('endpointInput',        locale.endpoint,        'text',     'url',              'endpoint')
  const regionInput          = makeField('regionInput',          locale.region,          'text',     'on',               'region', false)
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

  const sortLabel = document.createElement('label')
  sortLabel.htmlFor = 'sortSelect'
  sortLabel.textContent = locale.sortOrder
  settingsForm.appendChild(sortLabel)
  const sortSelect = document.createElement('select')
  sortSelect.id = 'sortSelect'
  sortSelect.add(new Option(locale.sortByName, ''))
  sortSelect.add(new Option(locale.sortBySortName, SORT_NAME))
  sortSelect.add(new Option(locale.sortBySortNameYear, SORT_NAME_YEAR))
  sortSelect.value = localStorage.getItem(SORT_KEY) || ''
  settingsForm.appendChild(sortSelect)

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
    [SORT_KEY]: sortSelect,
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
  // the transfer's messages next to its buttons, at the top of the dialog
  const transferMessage = document.createElement('div')
  transferMessage.className = 'error'

  const setMessage = (text) => {
    transferMessage.textContent = text
  }

  const addButton = (text, onclick) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.onclick = async () => {
      try {
        transferMessage.textContent = ''
        await onclick(button)
      } catch(e) {
        transferMessage.textContent = e.message || e.toString()
      }
    }
    transfer.appendChild(button)
    return button
  }

  addTransferControls({ dialog: ss, container: transfer, addButton, exportCode, importCode, setMessage })
  transfer.appendChild(transferMessage)

  const scan = document.createElement('fieldset')
  scan.className = 'scan'
  const scanLegend = document.createElement('legend')
  scanLegend.textContent = locale.scanTitle
  scan.appendChild(scanLegend)
  const scanInfo = document.createElement('p')
  scanInfo.textContent = locale.scanInfo
  scan.appendChild(scanInfo)
  const scanButton = document.createElement('button')
  scanButton.type = 'button'
  scanButton.textContent = locale.scanLibrary
  scan.appendChild(scanButton)
  const scanStatus = document.createElement('div')
  scanStatus.className = 'scan-status'
  scanStatus.setAttribute('role', 'status')
  scan.appendChild(scanStatus)
  const clearInfo = document.createElement('p')
  clearInfo.textContent = locale.clearInfo
  scan.appendChild(clearInfo)
  const clearButton = document.createElement('button')
  clearButton.type = 'button'
  clearButton.textContent = locale.clearLocalData
  scan.appendChild(clearButton)
  const clearStatus = document.createElement('div')
  clearStatus.className = 'clear-status'
  clearStatus.setAttribute('role', 'status')
  scan.appendChild(clearStatus)
  let scanning = false
  clearButton.onclick = async () => {
    clearStatus.textContent = ''
    try {
      await clearLocalData()
      clearStatus.textContent = locale.localDataCleared
    } catch(e) {
      console.error(e)
      clearStatus.textContent = locale.clearFailed
    }
  }
  scanButton.onclick = async () => {
    if (scanning) {
      stopLibraryScan()
      return
    }
    scanning = true
    clearButton.disabled = true
    scanButton.textContent = locale.stopLibraryScan
    const showProgress = ({done, total, failed}) => {
      scanStatus.textContent = locale.scanProgress(done, total, failed)
    }
    try {
      showProgress(await scanLibrary(showProgress))
    } catch(e) {
      console.error(e)
      scanStatus.textContent = locale.scanFailed
    }
    scanning = false
    clearButton.disabled = false
    scanButton.textContent = locale.scanLibrary
  }

  // asked when the source of the library changes and there is cached metadata
  const confirm = document.createElement('dialog')
  confirm.id = 'confirm-source'
  // Esc and the backdrop return to the settings
  confirm.setAttribute('closedby', 'any')
  const confirmText = document.createElement('p')
  confirmText.textContent = locale.sourceChanged
  confirm.appendChild(confirmText)
  const confirmError = document.createElement('div')
  confirmError.className = 'error'
  const confirmButtons = document.createElement('div')
  confirmButtons.className = 'buttons'
  const addConfirmButton = (text, onclick) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.onclick = onclick
    confirmButtons.appendChild(button)
    return button
  }
  addConfirmButton(locale.clearLocalData, async () => {
    try {
      await clearLocalData()
    } catch(e) {
      console.error(e)
      confirmError.textContent = locale.clearFailed
      return
    }
    confirmError.textContent = ''
    confirm.close()
    save()
  })
  addConfirmButton(locale.keepOldSettings, () => {
    confirm.close()
    settingsForm.reset()
  })
  addConfirmButton(locale.editSettings, () => confirm.close())
  confirm.appendChild(confirmButtons)
  confirm.appendChild(confirmError)

  // native reset would empty the fields, so restore the saved values instead
  settingsForm.onreset = (e) => {
    e.preventDefault()
    for (const [key, input] of Object.entries(settingsInputs)) {
      input.value = localStorage.getItem(key) || ''
    }
    playerColor.value = localStorage.getItem('playerColor') || defaultHue
    playerColor.dispatchEvent(new Event('input'))
    settingsError.textContent = ''
    transferMessage.textContent = ''
    ss.close()
  }

  const sourceChanged = () => ['endpoint', 'region', 'bucketName']
    .some(key => (settingsInputs[key].value || DEFAULTS[key] || '') != setting(key))

  settingsForm.onsubmit = async (e) => {
    e.preventDefault()
    if (sourceChanged() && await hasLocalData().catch(() => false)) {
      confirmError.textContent = ''
      confirm.showModal()
      return
    }
    save()
  }

  const save = () => {
    localStorage.setItem('accessKeyId', accessKeyIdInput.value)
    localStorage.setItem('secretAccessKey', secretAccessKeyInput.value)
    localStorage.setItem('endpoint', endpointInput.value)
    localStorage.setItem('region', regionInput.value)
    localStorage.setItem('bucketName', bucketInput.value)
    localStorage.setItem('playerColor', playerColor.value)
    localStorage.setItem(SORT_KEY, sortSelect.value)
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
  ss.appendChild(transfer)
  ss.appendChild(settingsForm)
  ss.appendChild(scan)
  document.body.appendChild(ss)
  document.body.appendChild(confirm)
  player.appendChild(gearBtn)

  return {
    showError(e) {
      // ss.classList.add('open')
      ss.showModal()
      settingsError.textContent = e.toString()
    }
  }
}
