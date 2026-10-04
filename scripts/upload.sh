#!/bin/bash
# Uploads MP3 files to the bucket, with their tags as the metadata the player
# reads, and the album art next to them (cover.jpg) as their image.
#
# Run it in the folder of your library that has the artist folders. The path
# of each file under it becomes its key in the bucket, Artist/Album/Track.mp3.
#
#   scripts/upload.sh                          everything under this folder
#   scripts/upload.sh "ABBA" "Miles Davis/Kind of Blue"   only these folders
#
# Needs the AWS CLI, ffprobe (from FFmpeg) and Python 3.

env_help() {
  cat >&2 <<EOF

Set the bucket and the endpoint of your provider first, for example:

  export S3BUCKET="music"
  export S3ENDPOINT="https://eu2.contabostorage.com"

and configure the AWS CLI with a key that can write to the bucket
(aws configure).
EOF
  exit 1
}

folder_help() {
  cat >&2 <<EOF

Run this in the folder that has the artist folders, and name the folders
to upload as they are under it:

  cd /path/to/your/music
  $0 ["Artist" | "Artist/Album" ...]
EOF
  exit 1
}

missing=0
for name in S3BUCKET S3ENDPOINT; do
  if [ -z "${!name}" ]; then
    echo "$name is not set." >&2
    missing=1
  fi
done
[ "$missing" = 1 ] && env_help

for tool in aws ffprobe python3; do
  if ! command -v "$tool" >/dev/null; then
    echo "$tool is needed, but not found." >&2
    exit 1
  fi
done

# the keys come from the paths, so the folders must be under this one
for folder in "$@"; do
  case "$folder" in
    /*|../*|..) echo "\"$folder\" is not under this folder, $(pwd)." >&2; folder_help ;;
  esac
  if [ ! -d "$folder" ]; then
    echo "There is no folder \"$folder\" in $(pwd)." >&2
    folder_help
  fi
done
[ $# = 0 ] && set -- .

# S3 metadata is ASCII: the values are URI encoded, and the player decodes them
enc() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

tag() {
  ffprobe -v error -show_entries "format_tags=$2" -of default=nw=1:nk=1 "$1" | head -n 1
}

# adds key=value to the metadata, when there is a value
add_meta() {
  [ -n "$2" ] && meta="${meta:+$meta,}$1=$(enc "$2")"
  return 0
}

upload_track() {
  file="$1"
  meta=""
  add_meta artist "$(tag "$file" artist)"
  add_meta album "$(tag "$file" album)"
  add_meta title "$(tag "$file" title)"
  add_meta tracknumber "$(tag "$file" track)"
  add_meta year "$(tag "$file" date)"
  add_meta genre "$(tag "$file" genre)"
  # the player's length is in milliseconds
  add_meta length "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" | awk '{printf "%d", $1 * 1000}')"
  cover="$(dirname "$file")/cover.jpg"
  [ -f "$cover" ] && add_meta image "$cover"
  aws --endpoint-url "$S3ENDPOINT" s3 cp "$file" "s3://$S3BUCKET/$file" \
    --content-type audio/mpeg --metadata "$meta"
}

upload_cover() {
  aws --endpoint-url "$S3ENDPOINT" s3 cp "$1" "s3://$S3BUCKET/$1" \
    --content-type image/jpeg
}

failed=0
for folder in "$@"; do
  while IFS= read -r -d '' file; do
    file="${file#./}"
    file="${file//\/\//\/}"
    case "$file" in
      *.mp3) upload_track "$file" || failed=1 ;;
      *) upload_cover "$file" || failed=1 ;;
    esac
  done < <(find "$folder" -type f \( -name '*.mp3' -o -name 'cover.jpg' \) -print0)
done

if [ "$failed" = 1 ]; then
  echo "Some files were not uploaded, see the errors above." >&2
  exit 1
fi
