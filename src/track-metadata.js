// Reading the values of a track's metadata (see "Organizing the bucket" in the README)

const decode = (value) => {
  try {
    return decodeURIComponent(String(value))
  } catch(e) {
    return String(value)
  }
}

// The number of a track as plain digits. Older uploads sent the raw tag, such
// as "11/16" or "02", so only the leading number counts. Text that doesn't
// start with a number, such as a vinyl side "A1", stays as it is.
export function parseTrackNumber(value) {
  const text = decode(value ?? '').trim()
  const match = text.match(/^\d+/)
  return match ? String(parseInt(match[0], 10)) : text
}

// The gain in dB from a ReplayGain value such as "-7.23" or "+3.1 dB", or null
function gainDecibels(value) {
  if (value == null) return null
  const match = decode(value).trim().match(/^([+-]?\d+(?:\.\d+)?)\s*(?:dB)?$/i)
  return match ? parseFloat(match[1]) : null
}

// The volume (0 to 1) that evens out a track's loudness. The track gain wins
// over the album gain. Browsers can't play louder than full volume with the
// volume property, so a track that needs a boost stays at 1.
export function replayGainVolume(metadata) {
  const gain = gainDecibels(metadata?.replaygaintrackgain) ?? gainDecibels(metadata?.replaygainalbumgain)
  if (gain == null) return 1
  return Math.min(1, 10 ** (gain / 20))
}
