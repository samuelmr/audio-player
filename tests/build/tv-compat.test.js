// The TV app must run on the oldest supported TVs: Tizen 6.0, Chromium 76
// (TV_CHROME in webpack.config.js). Babel lowers the syntax of the scripts,
// but not newer APIs or CSS, so these checks look at the built app.
// Playwright can't run a browser as old as that, so this is what catches
// code that the old TVs can't run.
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import * as acorn from 'acorn'
import postcss from 'postcss'
import doiuse from 'doiuse'
import { TV_CHROME } from '../../webpack.config.js'

const script = fs.readFileSync('dist/tizen/audioplayer.js', 'utf8')
const html = fs.readFileSync('dist/tizen/index.html', 'utf8')
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')

// Chromium of each Tizen version on Samsung TVs
const TIZEN_CHROME = {'6.0': 76, '6.5': 85, '7.0': 94, '8.0': 108, '9.0': 120}

function nodes(tree, visit) {
  ;(function walk(node) {
    if (!node || typeof node.type != 'string') return
    visit(node)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value == 'object') walk(value)
    }
  })(tree)
}

// where in the bundle, for the failure message
const at = (node) => `${script.slice(Math.max(0, node.start - 40), node.end + 40).replace(/\s+/g, ' ')}`

const tree = acorn.parse(script, {ecmaVersion: 'latest', sourceType: 'script'})

test('the Chromium version matches the Tizen version of config.xml', () => {
  const version = /required_version="([\d.]+)"/.exec(fs.readFileSync('tizen/config.xml', 'utf8'))[1]
  expect(TIZEN_CHROME[version], `Tizen ${version}`).toBe(TV_CHROME)
})

describe(`the TV app's script runs on Chromium ${TV_CHROME}`, () => {
  // syntax newer than ES2019, with the Chromium version that added it
  const SYNTAX = [
    ['optional chaining (?.)', 80, n => n.type == 'ChainExpression'],
    ['nullish coalescing (??)', 80, n => n.type == 'LogicalExpression' && n.operator == '??'],
    ['logical assignment (||= &&= ??=)', 85, n => n.type == 'AssignmentExpression' && ['||=', '&&=', '??='].includes(n.operator)],
    ['public class fields', 72, n => n.type == 'PropertyDefinition'],
    ['private class fields', 74, n => n.type == 'PropertyDefinition' && n.key.type == 'PrivateIdentifier'],
    ['private methods', 84, n => n.type == 'MethodDefinition' && n.key.type == 'PrivateIdentifier'],
    ['#field in object', 91, n => n.type == 'BinaryExpression' && n.left.type == 'PrivateIdentifier'],
    ['class static blocks', 94, n => n.type == 'StaticBlock'],
    ['regular expression flag d', 90, n => n.regex?.flags.includes('d')],
    ['regular expression flag v', 112, n => n.regex?.flags.includes('v')],
    ['BigInt literals', 67, n => n.bigint !== undefined],
    ['import.meta', 64, n => n.type == 'MetaProperty'],
  ]

  for (const [name, chrome, matches] of SYNTAX.filter(([, chrome]) => chrome > TV_CHROME)) {
    test(`no ${name} (Chromium ${chrome})`, () => {
      const found = []
      nodes(tree, node => matches(node) && found.push(at(node)))
      expect(found).toEqual([])
    })
  }

  // APIs newer than Chromium 76, which no build step adds
  const property = (name) => n => n.type == 'MemberExpression' && !n.computed && n.property.name == name
  const member = (object, name) => n => property(name)(n) && n.object.type == 'Identifier' && n.object.name == object
  const global = (name) => n => n.type == 'Identifier' && n.name == name
  const APIS = [
    ['Array/String at()', 92, property('at')],
    ['String replaceAll()', 85, property('replaceAll')],
    ['Array findLast()', 97, property('findLast')],
    ['Array findLastIndex()', 97, property('findLastIndex')],
    ['Array toSorted()', 110, property('toSorted')],
    ['Array toReversed()', 110, property('toReversed')],
    ['Array toSpliced()', 110, property('toSpliced')],
    ['Array.fromAsync()', 121, member('Array', 'fromAsync')],
    ['Object.hasOwn()', 93, member('Object', 'hasOwn')],
    ['Object.groupBy()', 117, member('Object', 'groupBy')],
    ['Promise.any()', 85, member('Promise', 'any')],
    ['Promise.withResolvers()', 119, member('Promise', 'withResolvers')],
    ['AbortSignal.timeout()', 103, member('AbortSignal', 'timeout')],
    ['AbortSignal.any()', 116, member('AbortSignal', 'any')],
    ['Element replaceChildren()', 86, property('replaceChildren')],
    ['crypto.randomUUID()', 92, property('randomUUID')],
    ['structuredClone()', 98, global('structuredClone')],
    ['AggregateError', 85, global('AggregateError')],
    ['WeakRef', 84, global('WeakRef')],
    ['FinalizationRegistry', 84, global('FinalizationRegistry')],
  ]
  // uses that check first whether the API is there
  const GUARDED = {
    'crypto.randomUUID()': 'the AWS SDK falls back to crypto.getRandomValues()',
  }

  for (const [name, chrome, matches] of APIS.filter(([, chrome]) => chrome > TV_CHROME)) {
    test(`no ${name} (Chromium ${chrome})`, () => {
      const found = []
      nodes(tree, node => matches(node) && found.push(at(node)))
      if (GUARDED[name]) {
        expect(found.every(code => code.includes('typeof')), `${name}: ${GUARDED[name]}`).toBe(true)
      }
      else {
        expect(found).toEqual([])
      }
    })
  }
})

describe(`the TV app's stylesheet works on Chromium ${TV_CHROME}`, () => {
  // features that doiuse reports as partly supported, for parts not used here
  const PARTLY_SUPPORTED = {
    'css-overflow': 'only overflow: clip is newer',
    'css-sticky': 'only sticky table parts are newer',
  }
  // the logical properties of Chromium 69; inset and the shorthands came later
  const OLD_LOGICAL = /^(margin|padding|border)-(block|inline)-(start|end)$/
  // only unprefixed appearance is newer (Chromium 84); the TV's progress
  // bar needs -webkit-appearance to be styled
  const PREFIXED_APPEARANCE = /^-webkit-appearance$/

  test('has no features that Chromium lacks', async () => {
    const found = []
    await postcss([doiuse({
      browsers: [`chrome ${TV_CHROME}`],
      onFeatureUsage: ({feature, featureData, usage}) => {
        if (PARTLY_SUPPORTED[feature]) return
        if (feature == 'css-logical-props' && OLD_LOGICAL.test(usage.prop)) return
        if (feature == 'css-appearance' && PREFIXED_APPEARANCE.test(usage.prop)) return
        found.push(`${featureData.title}: ${usage.toString().split('\n')[0]}`)
      },
    })]).process(css, {from: undefined})
    expect(found).toEqual([])
  })

  // Chromium 78 added these, and doiuse doesn't know about them
  test('has no percentages for opacity or alpha', () => {
    const opacities = css.match(/opacity:\s*[\d.]+%/g) || []
    // the alpha is the last argument; the others may have a var() inside
    const colors = css.match(/(hsla|rgba)\((?:[^()]|\([^()]*\))*\)/g) || []
    const alphas = colors.filter(color => /,\s*[\d.]+%\s*\)$/.test(color) && color.split(',').length == 4)
    expect([...opacities, ...alphas]).toEqual([])
  })
})
