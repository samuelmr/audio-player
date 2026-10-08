// The order of the library's folders, by the sort setting. The names and
// years come from the metadata the player has seen (see "Settings" in the
// README).

export const SORT_KEY = 'librarySort'
// '' keeps the order of the bucket, by folder name
export const SORT_NAME = 'sortname'
export const SORT_NAME_YEAR = 'sortname-year'

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'})

const decode = (value) => {
  try {
    return decodeURIComponent(String(value))
  } catch(e) {
    return String(value)
  }
}

// the first of the values of a multi-valued key, which are separated by "; "
const firstValue = (value) => decode(value).split('; ')[0].trim()

// The name an artist folder is sorted by: the albumartistsort of a track in
// it, or the artistsort when its tracks agree on one, or else the folder's
// own name. "The Beatles" may be sorted as "Beatles, The".
export function folderSortName(folder, records) {
  const prefix = folder + '/'
  let artistSort = ''
  let agree = true
  for (const record of records) {
    if (!record.key?.startsWith(prefix)) continue
    if (record.albumartistsort) {
      return firstValue(record.albumartistsort) || folder
    }
    if (record.artistsort) {
      const value = firstValue(record.artistsort)
      if (artistSort && value != artistSort) agree = false
      artistSort = artistSort || value
    }
  }
  return (agree && artistSort) || folder
}

// The year of an album, from one of its tracks: the earliest original
// release year, or else the earliest year. '' when no track has either.
export function trackYear(metadata) {
  const match = decode(metadata?.originaldate || metadata?.year || '').match(/^\d{4}/)
  return match ? match[0] : ''
}

export const earlierYear = (a, b) => (a && b) ? (a < b ? a : b) : (a || b)

// A sorted copy of the items: by their keys in alphabetical order, numbers by
// their value. The items without a key go last, in the order they had.
export function sortByKey(items, keyOf) {
  return items
    .map((item, index) => ({item, index, key: keyOf(item)}))
    .sort((a, b) => {
      if (!a.key || !b.key) return (!a.key - !b.key) || (a.index - b.index)
      return collator.compare(a.key, b.key) || (a.index - b.index)
    })
    .map(entry => entry.item)
}

// The order of the bucket: S3 lists keys by their bytes
export function sortByName(items, nameOf) {
  return [...items].sort((a, b) => {
    const x = nameOf(a), y = nameOf(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
}

// The shortcut of a name: its first letter, and one for all digits. A sort
// name's shortcut is in capitals, as the sorting ignores the case.
export function shortcutLetter(name, capital) {
  let first = name.slice(0, 1)
  if (first.match(/\d/)) {
    first = '1'
  }
  return capital ? first.toLocaleUpperCase() : first
}
