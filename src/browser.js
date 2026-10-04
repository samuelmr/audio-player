import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { folderDelimiter } from './constants.js'
import { locale } from './locale.js'
import { addSVG, playSVG } from './icons.js'
import { s3, bucketName, signedUrl, getObjectText, getS3Meta } from './s3.js'
import { collection, createAudioTrack, createSourceItem, setSourceLink } from './player.js'

export let browserList, playlistList
let skipMenu, previousFirst

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
    e.preventDefault()
    e.stopPropagation()
    const isOpen = this.classList.toggle('open')
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
    const command = new ListObjectsV2Command(input)
    const response = await s3.send(command)
    if (response.CommonPrefixes) {
      for (const obj of response.CommonPrefixes) {
        const folderName = obj.Prefix.replace(/\/$/, '')
        const li = createFolderElement(folderName, olRef)
        let first = folderName.slice(0, 1)
        if (first.match(/\d+/)) {
          first = '1'
        }
        if (first && first != previousFirst) {
          li.id = first
          const skipLi = document.createElement('li')
          const a = document.createElement('a')
          a.href = `#${first}`
          a.innerHTML = first
          a.title = locale.jumpTo(first)
          skipLi.appendChild(a)
          skipMenu.appendChild(skipLi)
          previousFirst = first
        }
        // folders[folderName] = folderName
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
        if (match) {
          const li = createFolderElement(match[1], olRef)
          li.classList.toggle('open', true)
          let ol = li.querySelector('ol')
          if (!ol) {
            ol = document.createElement('ol')
            li.appendChild(ol)
          }
          // ol.classList.toggle('hidden', false)
          subRef = ol
        }
        if (obj.Key.endsWith('.mp3')) {
          obj.Metadata = await getS3Meta(obj.Key, obj.LastModified)
          obj.href = await signedUrl(obj.Key)
          createSongElement(obj, subRef).then(li => {
            if (autoAdd) {
              li.querySelector('a')?.click()
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
  }
  catch(e) {
    console.error(e)
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
  a.innerHTML = addSVG
  a.onclick = async function(e) {
    e.preventDefault()
    e.stopPropagation()
    li.classList.add('open')
    history.pushState(folder, '', a.href)
    document.title = folder
    const cli = createSourceItem('folder', folder, folder)
    setSourceLink(folder)
    if (!li.querySelector('ol')) {
      await getFolders(li, true)
    }
    else {
      const tracks = e?.target?.closest('.folder')?.querySelectorAll('.song a')
      tracks.forEach((link) => {
        link.click()
      })
    }
    collection.appendChild(cli)
    // collection.innerHTML = (parent ? `${parent}: ` : '') + folder
    // collection.innerHTML = folder
  }
  li.appendChild(document.createTextNode(' '))
  li.appendChild(a)
  li.onclick = function(e) {
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
      getFolders(li)
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
    getFolders(li).then(() => {
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
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e?.pointerId > 0) {
      history.pushState(a.href, '', `#${obj.Key}`)
      document.title = a.textContent
      // collection.innerHTML = obj.Key
      const cli = createSourceItem('song', obj.Key, obj.Key)
      setSourceLink(obj.Key)
      collection.appendChild(cli)
    }
    createAudioTrack(obj)
  }
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
    const json = await getObjectText(obj.Key)
    try {
      const playlist = JSON.parse(json)
      const base = obj.Key.replace(/\/[^\/]+$/, '')
      playlist?.track.forEach(async (track) => {
        const song = {
          Bucket: bucketName,
          Key: track.url,
          Metadata: track,
        }
        song.href = await signedUrl(song.Key)
        createAudioTrack(song)
      })
    }
    catch(e) {
      console.error(e)
    }
  }
  li.appendChild(a)
  ol.appendChild(li)
  return li
}
