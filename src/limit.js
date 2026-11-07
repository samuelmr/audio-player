// Runs jobs, a few at a time, the ones of the 'queue' lane before the ones of
// the 'library' lane: the tracks the user is about to hear come before the
// ones that only fill the library.

export function createLimiter(parallel) {
  const lanes = {queue: [], library: []}
  let running = 0

  const next = () => {
    while (running < parallel) {
      const job = lanes.queue.shift() || lanes.library.shift()
      if (!job) return
      running++
      job()
    }
  }

  // returns what the job returns, once it has had its turn
  return (job, lane = 'queue') => new Promise((resolve, reject) => {
    lanes[lane].push(() => {
      Promise.resolve().then(job).then(resolve, reject).finally(() => {
        running--
        next()
      })
    })
    next()
  })
}
