// offline playlists use the same format as the .json playlists in S3:
// {title, track: [{url: <S3 key>, ...metadata}]}, plus id and created
export const OFFLINE_PLAYLISTS = 'offlinePlaylists'
export const OFFLINE_AUDIO = 'offlineAudio'

export let db

const dbRequest = indexedDB.open("audio-library", 4)
dbRequest.onupgradeneeded = function(event) {
  const db = dbRequest.result
  if (event.oldVersion < 1) {
    const cache = db.createObjectStore("meta", {keyPath: "key"})
    const artistIndex = cache.createIndex("by_artist", "artist")
    const albumIndex = cache.createIndex("by_album", "album")
    const titleIndex = cache.createIndex("by_title", "title")
    const tracknumberIndex = cache.createIndex("by_tracknumber", "tracknumber")
    const yearIndex = cache.createIndex("by_year", "year")
    const playlistIndex = cache.createIndex("by_playlist", "playlist")
    const genreIndex = cache.createIndex("by_genre", "genre")
    const commentIndex = cache.createIndex("by_comment", "comment")
  }
  if (event.oldVersion < 2) {
    const cache = dbRequest.transaction.objectStore("meta")
    const keyIndex = cache.createIndex("key", "key", {unique: true})
  }
  if (event.oldVersion < 3) {
    const cache = dbRequest.transaction.objectStore("meta")
    const commentIndex = cache.createIndex("image", "image")
  }
  if (event.oldVersion < 4) {
    db.createObjectStore(OFFLINE_PLAYLISTS, {keyPath: "id", autoIncrement: true})
    db.createObjectStore(OFFLINE_AUDIO, {keyPath: "key"})
  }
}
export const dbReady = new Promise((resolve, reject) => {
  dbRequest.onsuccess = function() {
    db = dbRequest.result
    resolve(db)
  }
  dbRequest.onerror = () => reject(dbRequest.error)
})

export const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export function getAllMeta() {
  return new Promise(
    function(resolve, reject) {
      if (!db) {
        return resolve([])
      }
      const request = db.transaction("meta", "readonly").objectStore("meta").getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    }
  )
}
