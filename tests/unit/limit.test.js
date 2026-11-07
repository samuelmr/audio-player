import { describe, test, expect } from 'vitest'
import { createLimiter } from '../../src/limit.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('createLimiter', () => {
  test('runs no more jobs at a time than it is given', async () => {
    const limit = createLimiter(2)
    let running = 0, most = 0
    const job = async () => {
      most = Math.max(most, ++running)
      await tick()
      running--
    }
    await Promise.all(Array.from({length: 6}, () => limit(job)))
    expect(most).toBe(2)
  })

  test('returns what a job returns, and what it throws', async () => {
    const limit = createLimiter(1)
    expect(await limit(() => 42)).toBe(42)
    await expect(limit(() => { throw new Error('no') })).rejects.toThrow('no')
    // a failed job doesn't stop the ones after it
    expect(await limit(() => 'next')).toBe('next')
  })

  test('runs the queue lane before the library lane', async () => {
    const limit = createLimiter(1)
    const order = []
    const job = (name) => async () => { order.push(name); await tick() }
    // the first job takes the only place; the others wait
    const first = limit(job('first'), 'library')
    const jobs = [limit(job('library 1'), 'library'), limit(job('library 2'), 'library'), limit(job('queue'), 'queue')]
    await Promise.all([first, ...jobs])
    expect(order).toEqual(['first', 'queue', 'library 1', 'library 2'])
  })
})
