// The checks that need Tizen Studio (npm run test:tizen):
//   1. package and sign the TV app with the active certificate profile
//   2. check the .wgt: its files, signatures and config.xml
//   3. with TV_IP set, install it on that TV and launch it
// Tizen Studio is looked for in $TIZEN_STUDIO, or else ~/tizen-studio.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const studio = process.env.TIZEN_STUDIO || path.join(os.homedir(), 'tizen-studio')
const tizen = path.join(studio, 'tools/ide/bin/tizen')
const sdb = path.join(studio, 'tools/sdb')
const wgt = 'dist/tizen/CtrlMusic.wgt'
const appId = /<tizen:application id="([^"]+)"/.exec(fs.readFileSync('tizen/config.xml', 'utf8'))[1]

let failures = 0

function check(name, ok, details = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) {
    failures++
    if (details) console.log(details.trim().replace(/^/gm, '    '))
  }
  return ok
}

// the Tizen CLI may exit with 0 on errors, so its output is checked too
function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', shell: false})
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`
  return {ok: result.status == 0 && !/\b(error|fail(ed|ure)?)\b/i.test(output), output}
}

if (!fs.existsSync(tizen)) {
  console.error(`Tizen Studio wasn't found in ${studio}. Set TIZEN_STUDIO to where it is.`)
  console.error('Without it, npm run check runs every other test.')
  process.exit(1)
}

fs.rmSync(wgt, {force: true})
const packaged = spawnSync('npm', ['run', '--silent', 'package:tizen'], {encoding: 'utf8'})
const packageOutput = `${packaged.stdout}${packaged.stderr}`
check('packages and signs the TV app', packaged.status == 0 && fs.existsSync(wgt), packageOutput.split('\n').slice(-15).join('\n'))

if (fs.existsSync(wgt)) {
  const files = spawnSync('unzip', ['-Z1', wgt], {encoding: 'utf8'}).stdout.split('\n').filter(Boolean).sort()
  const expected = ['audioplayer.js', 'author-signature.xml', 'config.xml', 'icon.png', 'index.html', 'signature1.xml']
  check('the package has the app and its signatures', JSON.stringify(files) == JSON.stringify(expected),
    `expected: ${expected.join(', ')}\nfound:    ${files.join(', ')}`)
  const config = spawnSync('unzip', ['-p', wgt, 'config.xml'], {encoding: 'utf8'}).stdout
  check("the package's config.xml is tizen/config.xml", config == fs.readFileSync('tizen/config.xml', 'utf8'))
  const signature = spawnSync('unzip', ['-p', wgt, 'author-signature.xml'], {encoding: 'utf8'}).stdout
  check('the author signature covers the script', signature.includes('URI="audioplayer.js"'))
}

const tvIp = process.env.TV_IP
if (!tvIp) {
  console.log('- skipped installing on a TV: set TV_IP to the address of a TV in developer mode')
}
else if (fs.existsSync(wgt)) {
  const connected = run(sdb, ['connect', tvIp])
  if (check(`connects to the TV at ${tvIp}`, connected.ok && /connected/i.test(connected.output), connected.output)) {
    // like npm run install:tv, to the one connected device
    const installed = run(tizen, ['install', '-n', path.basename(wgt), '--', path.dirname(wgt)])
    if (check('installs on the TV', installed.ok, installed.output)) {
      const launched = run(tizen, ['run', '-p', appId])
      check('launches on the TV', launched.ok && /launched/i.test(launched.output), launched.output)
    }
  }
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
