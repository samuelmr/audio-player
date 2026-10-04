// Drives the TV app on a TV in developer mode, over the DevTools protocol:
// presses keys of the remote, runs JavaScript in the app, takes screenshots.
//
//   TV_IP=192.168.1.20 node scripts/tv-debug.js --launch key:ArrowDown key:Enter
//   TV_IP=192.168.1.20 node scripts/tv-debug.js "eval:document.activeElement.id" shot:tv.png
//
// --launch (re)starts the app in debug mode. Without it, the steps go to the
// app the last --launch started, so its state is kept between runs.
//
// The steps, run in order:
//   key:ArrowDown        press and release a key (Back, Enter, the arrows,
//                        or a key code, such as key:10252 for Play/Pause)
//   hold:ArrowDown,2000  hold a key down for that many milliseconds
//   eval:<js>            run JavaScript in the app and print its value
//   wait:<ms>            wait
//   shot:<file.png>      save a screenshot
// After each key, it prints the element that has the focus.
//
// Install the app on the TV first (npm run install:tv). Tizen Studio is
// looked for in $TIZEN_STUDIO, or else ~/tizen-studio. Needs Node 22 or later.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const studio = process.env.TIZEN_STUDIO || path.join(os.homedir(), 'tizen-studio')
const sdb = path.join(studio, 'tools/sdb')
const appId = /<tizen:application id="([^"]+)"/.exec(fs.readFileSync('tizen/config.xml', 'utf8'))[1]
const packageId = appId.split('.')[0]
// the debug port of the app on the TV, from the last --launch
const portFile = path.join(os.tmpdir(), 'ctrl-music-tv-debug-port')
const LOCAL_PORT = 9460

const tvIp = process.env.TV_IP
if (!tvIp) {
  console.error('Set TV_IP to the address of a TV in developer mode, for example:\n')
  console.error('  TV_IP=192.168.1.20 node scripts/tv-debug.js --launch key:ArrowDown\n')
  console.error('Install the app on it first: TV_IP=192.168.1.20 npm run install:tv')
  process.exit(1)
}
if (!fs.existsSync(sdb)) {
  console.error(`Tizen Studio wasn't found in ${studio}. Set TIZEN_STUDIO to where it is.`)
  process.exit(1)
}
const tv = `${tvIp}:26101`

// sdb may hang when the TV doesn't answer, so every call has a time limit
function run(args, timeout = 30000) {
  const result = spawnSync(sdb, args, {encoding: 'utf8', timeout})
  return `${result.stdout || ''}${result.stderr || ''}`
}

const args = process.argv.slice(2)
const launch = args[0] == '--launch'
const steps = launch ? args.slice(1) : args

run(['connect', tvIp])
if (launch) {
  run(['-s', tv, 'shell', '0', 'was_kill', packageId], 20000)
  const port = /port: (\d+)/.exec(run(['-s', tv, 'shell', '0', 'debug', appId]))?.[1]
  if (!port) {
    console.error(`Couldn't start ${appId} in debug mode. Is it installed, and the TV on?`)
    process.exit(1)
  }
  fs.writeFileSync(portFile, port)
}
if (!fs.existsSync(portFile)) {
  console.error('Start the app with --launch first.')
  process.exit(1)
}
run(['forward', '--remove-all'])
run(['-s', tv, 'forward', `tcp:${LOCAL_PORT}`, `tcp:${fs.readFileSync(portFile, 'utf8').trim()}`])

let targets
try {
  targets = await (await fetch(`http://127.0.0.1:${LOCAL_PORT}/json`)).json()
} catch (e) {
  console.error("Couldn't connect to the app. Has it been closed since the last --launch?")
  process.exit(1)
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
await new Promise(resolve => ws.onopen = resolve)

let id = 0
const pending = new Map()
ws.onmessage = (message) => {
  const data = JSON.parse(message.data)
  pending.get(data.id)?.(data)
  pending.delete(data.id)
}
const send = (method, params) => new Promise(resolve => {
  pending.set(++id, resolve)
  ws.send(JSON.stringify({id, method, params}))
})
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// the key codes of the remote, as the app gets them
const CODES = {Back: 10009, Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40}
const keyEvent = (type, key, autoRepeat = false) => {
  const code = CODES[key] ?? Number(key)
  return send('Input.dispatchKeyEvent', {type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, autoRepeat})
}

const evaluate = async (expression) => {
  const {result} = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})
  return result.result?.value ?? result.exceptionDetails?.exception?.description
}
const FOCUSED = `(() => {
  const e = document.activeElement
  return e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).replace(/ /g, '.') : '')
    + ' "' + (e.value || e.textContent || e.title || '').trim().slice(0, 40) + '"'
})()`

for (const step of steps) {
  const [kind, ...rest] = step.split(':')
  const arg = rest.join(':')
  if (kind == 'key') {
    await keyEvent('rawKeyDown', arg)
    await keyEvent('keyUp', arg)
    await wait(250)
    console.log(`${arg} -> ${await evaluate(FOCUSED)}`)
  }
  else if (kind == 'hold') {
    // repeated keydowns every 50 ms, as a held key of the remote sends them
    const [key, ms] = arg.split(',')
    const start = Date.now()
    let repeats = 0
    while (Date.now() - start < Number(ms)) {
      await keyEvent('rawKeyDown', key, repeats++ > 0)
      await wait(50)
    }
    await keyEvent('keyUp', key)
    await wait(300)
    console.log(`hold ${key} ${ms} ms (${repeats} keydowns) -> ${await evaluate(FOCUSED)}`)
  }
  else if (kind == 'eval') {
    console.log('eval ->', JSON.stringify(await evaluate(arg)))
  }
  else if (kind == 'wait') {
    await wait(Number(arg))
  }
  else if (kind == 'shot') {
    const {result} = await send('Page.captureScreenshot', {format: 'png'})
    fs.writeFileSync(arg, Buffer.from(result.data, 'base64'))
    console.log('screenshot ->', arg)
  }
  else {
    console.error(`Unknown step: ${step}`)
  }
}
ws.close()
