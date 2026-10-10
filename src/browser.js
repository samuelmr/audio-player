import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { folderDelimiter } from './constants.js'
import { locale } from './locale.js'
import { addSVG, playSVG } from './icons.js'
import { s3, bucketName, objectUrl, getObjectText, getS3Meta } from './s3.js'
import { collection, createAudioTrack, createSourceItem, setSourceLink } from './player.js'
import { notify } from './adding.js'
import { getAllMeta } from './db.js'
import { SORT_KEY, SORT_NAME_YEAR, folderSortName, trackYear, earlierYear, sortByKey, sortByName, shortcutLetter } from './library-order.js'

export let browserList, playlistList
let skipMenu

// a link to a folder or a song adds it to the queue on load. The folders
// above it are opened first, and their listing has the link's own element.
const myUri = new URL(document.location.href)
let linked = decodeURIComponent(myUri.hash.replace('#', ''))

// returns the skip navigation bar, for the search box
export function initBrowser(browser, player) {
  const skipNav = document.createElement('nav')
  skipNav.id = 'skipNav'
  skipMenu = document.createElement('ol')
  const li = document.createElement('li')
  const a = document.createElement('a')
  a.href = `#${player.id}`
  a.title = locale.jumpToPlayer
  // an image: not every font has the play symbol
  a.innerHTML = playSVG
  li.appendChild(a)
  skipMenu.appendChild(li)
  skipNav.appendChild(skipMenu)
  browserList = document.createElement('nav')
  const playlistParent = document.createElement('ol')
  playlistParent.id = 'playlists'
  playlistParent.className = 'playlists'
  const pli = document.createElement('li')
  pli.className = 'folder'
  pli.innerHTML = locale.playlistTitle
  pli.onclick = function(e) {
    // not a click on a playlist in it
    if (e.target != this) return
    e.preventDefault()
    e.stopPropagation()
    this.classList.toggle('open')
  }
  playlistList = document.createElement('ol')
  playlistList.className = 'playlists'
  pli.appendChild(playlistList)
  playlistParent.appendChild(pli)
  const mli = document.createElement('li')
  const pa = document.createElement('a')
  pa.title = locale.jumpTo(locale.playlistTitle)
  pa.href = `#playlists`
  pa.innerHTML = '#'
  mli.appendChild(pa)
  skipMenu.appendChild(mli)
  browser.innerHTML = ''
  browser.appendChild(skipNav)
  browserList.appendChild(playlistParent)
  browser.appendChild(browserList)
  return skipNav
}

export async function getFolders(parentElement=null, autoAdd=false, token=null) {
  const input = {Bucket: bucketName}
  if (token) {
    input.ContinuationToken = token
  }
  if (parentElement.dataset.folder) {
    input['Prefix'] = decodeURIComponent(parentElement.dataset.folder) + '/'
  }
  else {
    input['Delimiter'] = folderDelimiter
  }
  try {
    let olRef = parentElement.querySelector('ol:not(.playlists)')
    if (!olRef) {
      const ol = document.createElement('ol')
      parentElement.appendChild(ol)
      olRef = ol
    }
    // the albums by year are added once they are in order
    const byYear = input.Prefix && localStorage.getItem(SORT_KEY) == SORT_NAME_YEAR
    const command = new ListObjectsV2Command(input)
    const response = await s3.send(command)
    if (response.CommonPrefixes) {
      for (const obj of response.CommonPrefixes) {
        createFolderElement(obj.Prefix.replace(/\/$/, ''), olRef)
      }
    }
    if (response.Contents) {
      let subRef = olRef
      for (const obj of response.Contents) {
        let trimmed = obj.Key
        if (input.Prefix) {
          trimmed = trimmed.replace(input.Prefix + '/', '')
        }
        const match = trimmed.match(/^(.*)\/[^\/]*$/)
        let folderLi
        if (match) {
          folderLi = createFolderElement(match[1], olRef)
          folderLi.classList.toggle('open', true)
          let ol = folderLi.querySelector('ol')
          if (!ol) {
            ol = document.createElement('ol')
            folderLi.appendChild(ol)
          }
          // ol.classList.toggle('hidden', false)
          subRef = ol
        }
        if (obj.Key.endsWith('.mp3')) {
          obj.Metadata = await getS3Meta(obj.Key, obj.LastModified)
          obj.href = await objectUrl(obj.Key)
          if (folderLi) {
            folderLi.dataset.year = earlierYear(folderLi.dataset.year, trackYear(obj.Metadata))
          }
          createSongElement(obj, subRef).then(li => {
            if (autoAdd && !byYear) {
              li.addToFolder()
            }
          })
        }
        else if (obj.Key.endsWith('.json')) {
          const li = createPlaylistElement(obj, playlistList)
        }
        else if (obj.Key.endsWith('.m3u')) {
          // playlists.push(obj.Key)
        }
      }
    }
    if (response.IsTruncated) {
      await getFolders(parentElement, autoAdd, response.NextContinuationToken)
    }
    else if (!input.Prefix) {
      await orderLibrary()
    }
    else if (byYear) {
      // the tracks beside the albums have no year, and go last
      olRef.append(...sortByKey([...olRef.children], li => li.dataset.year))
      if (autoAdd) {
        olRef.querySelectorAll('li.song').forEach(song => song.addToFolder())
      }
    }
  }
  catch(e) {
    console.error(e)
  }
}

// the bucket may have changed: forget the folders and playlists listed
export function clearLibrary() {
  browserList?.querySelector(':scope > ol:not(.playlists)')?.remove()
  if (playlistList) playlistList.textContent = ''
}

const folderItems = (ol) => [...ol.children].filter(li => li.matches('li.folder'))

// Puts the artist folders, and the tracks beside them, in the order of the
// sort setting, and gives each letter its shortcut. Without the sort setting,
// in the order of the bucket. The sort names come from the tracks seen
// before, or from a library scan.
export async function orderLibrary() {
  const ol = browserList?.querySelector(':scope > ol:not(.playlists)')
  if (!ol) return
  const sorted = Boolean(localStorage.getItem(SORT_KEY))
  const items = [...ol.children]
  const names = new Map(items.map(li => [li, li.dataset.folder || li.dataset.key || '']))
  if (sorted) {
    const records = await getAllMeta()
    for (const li of folderItems(ol)) {
      names.set(li, folderSortName(li.dataset.folder, records))
    }
  }
  const ordered = sorted ? sortByKey(items, li => names.get(li)) : sortByName(items, li => names.get(li))
  ol.append(...ordered)

  skipMenu.querySelectorAll('li.letter').forEach(li => li.remove())
  const letters = new Set()
  for (const li of ordered.filter(li => li.matches('li.folder'))) {
    li.removeAttribute('id')
    const letter = shortcutLetter(names.get(li), sorted)
    if (!letter || letters.has(letter)) continue
    letters.add(letter)
    li.id = letter
    const skipLi = document.createElement('li')
    skipLi.className = 'letter'
    const a = document.createElement('a')
    a.href = `#${letter}`
    a.textContent = letter
    a.title = locale.jumpTo(letter)
    skipLi.appendChild(a)
    skipMenu.appendChild(skipLi)
  }
}

function createFolderElement(folder, ol) {
  const candidate = ol.querySelector(`[data-folder="${folder}"]`)
  if (candidate) return candidate
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'folder'
  li.dataset.folder = folder
  li.textContent = folder.replace(`${parent}/`, '')
  const a = document.createElement('a')
  // a.href = '#' + (parent ? encodeURIComponent(parent) + '/' : '') + encodeURIComponent(folder)
  a.href = '#' + encodeURIComponent(folder)
  a.className = 'action add'
  a.title = locale.playFolder
  // a.textContent = '⥅' // '⤅' '⧐' '⏵'
  // a.innerHTML = '<i class="fa-solid fa-album-circle-plus"></i>'
  // the web app shows the label, as the first row of the open folder
  a.innerHTML = addSVG
  const label = document.createElement('span')
  label.className = 'label'
  label.textContent = locale.playFolder
  a.appendChild(label)
  a.onclick = async function(e) {
    e.preventDefault()
    e.stopPropagation()
    li.classList.add('open')
    history.pushState(folder, '', a.href)
    document.title = folder
    const cli = createSourceItem('folder', folder, folder)
    setSourceLink(folder)
    // all of the folder, also when it was opened a moment ago and is
    // still being listed, by itself or as part of a folder above it
    for (let listed = li; listed; listed = listed.parentNode.closest('li.folder')) {
      await listed.listing
    }
    if (!li.querySelector('ol')) {
      await getFolders(li, true)
    }
    else {
      e?.target?.closest('.folder')?.querySelectorAll('li.song').forEach(song => song.addToFolder())
    }
    collection.appendChild(cli)
    // collection.innerHTML = (parent ? `${parent}: ` : '') + folder
    // collection.innerHTML = folder
  }
  li.appendChild(document.createTextNode(' '))
  li.appendChild(a)
  li.onclick = function(e) {
    // only a click on the folder's own row, not on its contents, nor
    // between them
    if (e.target != this) return
    e.preventDefault()
    e.stopPropagation()
    const isOpen = this.classList.toggle('open')
    // history.pushState(folder, '', a.href)
    document.title = folder
    const subLists = this.querySelectorAll('li ol')
    if (subLists.length > 0) {
      for (const subList of subLists) {
        subList.classList.toggle('hidden', !isOpen)
      }
    }
    else {
      li.listing = getFolders(li)
    }
  }
  li.appendChild(a)
  if (linked == folder) {
    linked = ''
    a.click()
  }
  else if (linked.startsWith(folder + folderDelimiter)) {
    const target = linked
    linked = ''
    li.classList.add('open')
    li.listing = getFolders(li)
    li.listing.then(() => {
      const item = li.querySelector(`li.folder[data-folder="${CSS.escape(target)}"], li.song[data-key="${CSS.escape(target)}"]`)
      item?.querySelector(':scope > a.add')?.click()
    })
  }
  ol.appendChild(li)
  return li
}

async function createSongElement(obj, ol) {
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'song'
  li.dataset.key = obj.Key
  li.textContent = obj.Key.replace(`${parent}/`, '') + ' '
  const a = document.createElement('a')
  a.className = 'action add'
  a.href = obj.href
  a.title = locale.playSong
  // a.textContent = '⧐' // '⥅' '⏵'
  a.innerHTML = addSVG
  // the song by itself, with an entry of its own above the queue
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    history.pushState(a.href, '', `#${obj.Key}`)
    document.title = a.textContent
    setSourceLink(obj.Key)
    collection.appendChild(createSourceItem('song', obj.Key, obj.Key))
    createAudioTrack(obj, obj.Key)
  }
  // as part of the folder being added, which has the entry
  li.addToFolder = () => createAudioTrack(obj)
  li.appendChild(a)
  ol.appendChild(li)
  if (linked == obj.Key) {
    linked = ''
    a.click()
  }
  return li
}

async function createPlaylistElement(obj, ol) {
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'playlist'
  li.textContent = obj.Key.replace(`${parent}/`, '') + ' '
  const a = document.createElement('a')
  a.className = 'action add'
  a.href = obj.Key
  a.title = locale.playPlaylist
  // a.textContent = '⧐' // '⥅' '⏵'
  a.innerHTML = addSVG
  a.onclick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    // if (e?.pointerId > 0) {
      history.pushState(a.href, '', `#${obj.Key}`)
      document.title = a.textContent
      // collection.innerHTML = obj.Key
      const cli = createSourceItem('playlist', obj.Key, obj.Key)
      setSourceLink(obj.Key)
      collection.appendChild(cli)
    // }
    try {
      const json = await getObjectText(obj.Key)
      const playlist = JSON.parse(json)
      const base = obj.Key.replace(/\/[^\/]+$/, '')
      // one at a time, to keep the queue in the listed order
      for (const track of playlist?.track || []) {
        const song = {
          Bucket: bucketName,
          Key: track.url,
          Metadata: track,
        }
        song.href = await objectUrl(song.Key)
        await createAudioTrack(song)
      }
    }
    catch(e) {
      // the playlist may be gone, such as after a change of bucket
      console.error(e)
      cli.querySelector('a').click()
      notify(locale.playlistFailed(obj.Key.replace(/^.*\//, '')))
    }
  }
  li.appendChild(a)
  ol.appendChild(li)
  return li
}
