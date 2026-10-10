import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const notify = vi.fn()
vi.mock('../../src/adding.js', () => ({ notify }))

const { reportError } = await import('../../src/errors.js')
const { locale } = await import('../../src/locale.js')

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  notify.mockClear()
  // past the repeat time of the earlier test
  vi.advanceTimersByTime(60000)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('reporting an error', () => {
  test('tells the user the given text, and logs the error', () => {
    const error = new Error('boom')
    reportError(error, 'Could not do it')
    expect(notify).toHaveBeenCalledWith('Could not do it')
    expect(console.error).toHaveBeenCalledWith(error)
  })

  test('says something went wrong when there is no text', () => {
    reportError(new Error('boom'))
    expect(notify).toHaveBeenCalledWith(locale.somethingFailed)
  })

  test('tells the same text once for a loop of failures, and again after a while', () => {
    reportError(new Error('1'), 'Same')
    reportError(new Error('2'), 'Same')
    expect(notify).toHaveBeenCalledTimes(1)
    reportError(new Error('3'), 'Other')
    expect(notify).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(6000)
    reportError(new Error('4'), 'Other')
    expect(notify).toHaveBeenCalledTimes(3)
  })

  test('logs every error, also the ones not told', () => {
    reportError(new Error('1'), 'Same')
    reportError(new Error('2'), 'Same')
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
