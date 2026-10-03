#usage
```sh
export S3BUCKET="music"
export S3ENDPOINT="https://eu2.contabostorage.com"
npm run build:pwa
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key index.html --content-type text/html --body dist/pwa/index.html
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key audioplayer.js --content-type text/javascript --body dist/pwa/audioplayer.js
aws --endpoint-url $S3ENDPOINT s3api put-object --bucket $S3BUCKET --key sw.js --content-type text/javascript --body dist/pwa/sw.js
```

#layout
- `src/` the app's modules; `src/platform/` has what is specific to a platform
- `pwa/` the web app's HTML template, service worker, manifest and icon

`npm run build` builds the web app into `dist/pwa`.

