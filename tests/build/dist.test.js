// What `npm run build` puts in dist/ for each app: the files a deployment
// needs, in the form each platform loads them
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as acorn from 'acorn'

const read = (file) => fs.readFileSync(file, 'utf8')
const parses = (file, sourceType) => () => acorn.parse(read(file), {ecmaVersion: 'latest', sourceType})

describe('the PWA', () => {
  const dir = 'dist/pwa'

  test('has the files to deploy', () => {
    // and the AWS SDK's lazily loaded chunks, such as 274.audioplayer.js
    const files = fs.readdirSync(dir).filter(file => !/^\d+\.audioplayer\.js$/.test(file))
    expect(files.sort()).toEqual(['audioplayer.js', 'fonts', 'index.html', 'manifest.json', 'play-192.png', 'play-512.png', 'privacy.html', 'sw.js'])
  })

  test('loads its script as a module, with the stylesheet inlined', () => {
    const html = read(`${dir}/index.html`)
    expect(html).toMatch(/<script[^>]*type="module"[^>]*src="audioplayer.js"|<script[^>]*src="audioplayer.js"[^>]*type="module"/)
    expect(html).not.toContain('<%')
    expect(html).toContain(read('src/styles.css').trim())
    expect(parses(`${dir}/audioplayer.js`, 'module')).not.toThrow()
  })

  // minified, but not bundled: service workers can't load modules everywhere
  test('has the service worker unbundled, next to index.html', () => {
    expect(read(`${dir}/sw.js`)).not.toContain('__webpack')
    expect(parses(`${dir}/sw.js`, 'script')).not.toThrow()
  })

  test('has a manifest whose icons are there', () => {
    const manifest = JSON.parse(read(`${dir}/manifest.json`))
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(dir, icon.src)), icon.src).toBe(true)
    }
  })
})

describe('the TV app', () => {
  const dir = 'dist/tizen'
  const config = read(`${dir}/config.xml`)

  test('has the files to package, and one script without chunks', () => {
    // and what `npm run package:tizen` adds, if it was run since the build
    const packaging = /\.wgt$|signature\d*\.xml$|^\.manifest\.tmp$/
    expect(fs.readdirSync(dir).filter(file => !packaging.test(file)).sort()).toEqual(['audioplayer.js', 'config.xml', 'fonts', 'icon.png', 'index.html'])
  })

  test('loads its script as a classic script, with the stylesheet inlined', () => {
    const html = read(`${dir}/index.html`)
    expect(html).toMatch(/<script[^>]*defer[^>]*src="audioplayer.js"|<script[^>]*src="audioplayer.js"[^>]*defer/)
    expect(html).not.toContain('type="module"')
    expect(html).not.toContain('<%')
    expect(html).toContain(read('src/styles.css').trim())
    // no import or export: a .wgt is loaded from local files
    expect(parses(`${dir}/audioplayer.js`, 'script')).not.toThrow()
  })

  test('has a config.xml whose files are there', () => {
    expect(config).toBe(read('tizen/config.xml'))
    expect(config).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/)
    for (const [, file] of config.matchAll(/<(?:content|icon) src="([^"]+)"/g)) {
      expect(fs.existsSync(path.join(dir, file)), file).toBe(true)
    }
  })

  test('asks for the privileges that it uses', () => {
    expect(config).toContain('<tizen:profile name="tv-samsung"/>')
    // the S3 bucket, and the remote's media keys
    expect(config).toContain('http://tizen.org/privilege/internet')
    expect(config).toContain('http://tizen.org/privilege/tv.inputdevice')
    expect(config).toMatch(/<access origin="\*"/)
  })

  test('has an application id within its package', () => {
    const [, id, pkg] = /<tizen:application id="([^"]+)" package="([^"]+)"/.exec(config)
    expect(id.startsWith(`${pkg}.`)).toBe(true)
    // Tizen's format: ten letters or digits
    expect(pkg).toMatch(/^[A-Za-z0-9]{10}$/)
  })
})

// the privacy policy says that the apps contact no one but the bucket
describe.each(['dist/pwa', 'dist/tizen'])('%s', (dir) => {
  const html = read(`${dir}/index.html`)

  test('loads nothing from other sites', () => {
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//)
    expect(html).not.toMatch(/@import|url\((?:['"])?(?:https?:)?\/\//)
  })

  test('has the fonts of its @font-face rules', () => {
    const fonts = [...html.matchAll(/src: url\((fonts\/[^)]+)\)/g)].map(m => m[1])
    expect(fonts.length).toBe(8)
    for (const font of fonts) {
      expect(fs.existsSync(path.join(dir, font)), font).toBe(true)
    }
  })
})
