import HtmlWebpackPlugin from "html-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import webpack from "webpack";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// both apps inline the same stylesheet into their HTML
const styles = fs.readFileSync(path.resolve(__dirname, "src/styles.css"), "utf8");

// and serve the font files that its @font-face rules load from fonts/
const fonts = {
  from: "node_modules/@fontsource/source-sans-pro/files/source-sans-pro-{latin,latin-ext}-{200,400,600,700}-normal.woff2",
  to: "fonts/[name][ext]",
};

// the default bucket of src/defaults.js, given when building, as the
// deployment does from a variable of the repository
const defaults = new webpack.DefinePlugin({
  "process.env.DEFAULT_BUCKET_URL": JSON.stringify(process.env.DEFAULT_BUCKET_URL || ""),
});

// '#platform' picks the platform-specific module of each app
const shared = (name) => ({
  name,
  mode: "production",
  entry: "./src/main.js",
  resolve: {
    alias: {
      "#platform": path.resolve(__dirname, `src/platform/${name}.js`),
    },
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: true,
          },
        },
        extractComments: false,
      }),
    ],
  },
});

const pwa = {
  ...shared("pwa"),
  output: {
    // named by their content, so that a new index.html never gets an old
    // script from a cache
    filename: "audioplayer.[contenthash].js",
    chunkFilename: "[id].[contenthash].js",
    path: path.resolve(__dirname, "dist/pwa"),
    clean: true,
    library: {
      type: "module",
    },
  },
  plugins: [
    defaults,
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'pwa/index.html',
      scriptLoading: 'module',
      styles,
    }),
    // the service worker must be served next to index.html, unbundled, and
    // the privacy policy is a page of its own
    new CopyPlugin({
      patterns: [
        ...['pwa/sw.js', 'pwa/manifest.json', 'pwa/play-192.png', 'pwa/play-512.png', 'pwa/privacy.html'].map(from => ({from, to: '[name][ext]'})),
        fonts,
      ],
    }),
  ],
  devServer: {
    // serve manifest.json and icons from the PWA folder
    static: {
      directory: path.resolve(__dirname, "pwa"),
      watch: false,
    },
  },
  experiments: {
    outputModule: true,
  },
};

// The oldest TVs supported (2021 models, Tizen 6.0) run Chromium 76.
// tests/build/tv-compat.test.js checks the built TV app against it
export const TV_CHROME = 76

// The TV apps are loaded from files in their packages: the Samsung TV app
// from a .wgt, the Google TV app from the assets of an Android app
// (android/). So each is one classic script without lazy-loaded chunks,
// for the oldest Chromium of the two. extra are files of the platform's
// own, and meta the <meta> tags of its page.
const tv = (name, { extra = [], meta = {} } = {}) => ({
  ...shared(name),
  // the dependencies too: most of the newer syntax comes from the AWS SDK
  module: {
    rules: [{
      test: /\.m?js$/,
      use: {
        loader: "babel-loader",
        options: {
          sourceType: "unambiguous",
          presets: [["@babel/preset-env", { targets: { chrome: TV_CHROME } }]],
        },
      },
    }],
  },
  output: {
    filename: "audioplayer.js",
    path: path.resolve(__dirname, `dist/${name}`),
    clean: true,
  },
  plugins: [
    defaults,
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'tv/index.html',
      scriptLoading: 'defer',
      styles,
      meta,
    }),
    new CopyPlugin({
      patterns: [
        ...extra,
        fonts,
      ].map(p => typeof p == 'string' ? {from: p, to: '[name][ext]'} : p),
    }),
  ],
});

const tizen = tv("tizen", {extra: ['tizen/config.xml', {from: 'pwa/play-192.png', to: 'icon.png'}]});

// Its icons are in android/. Google TV devices draw at twice the density, so
// the page is laid out 1920 pixels wide, as on the Samsung TVs, and the
// WebView scales it to the screen.
const androidtv = tv("androidtv", {meta: {viewport: 'width=1920'}});

export default [pwa, tizen, androidtv];
