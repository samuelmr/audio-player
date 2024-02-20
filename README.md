export S3BUCKET="music"
export S3ENDPOINT="https://eu2.contabostorage.com"
npm run build && aws --endpoint-url $S3ENDPOINT  s3api put-object --bucket $S3BUCKET  --key index.html --content-type text/html --body dist/index.html && aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key audioplayer.js --content-type text/javascript --body dist/audioplayer.js
