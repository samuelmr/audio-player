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
    filename: "audioplayer.js",
    path: path.resolve(__dirname, "dist/pwa"),
    clean: true,
    library: {
      type: "module",
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'pwa/index.html',
      scriptLoading: 'module',
      styles,
    }),
    // the service worker must be served next to index.html, unbundled
    new CopyPlugin({
      patterns: ['pwa/sw.js', 'pwa/manifest.json', 'pwa/play-192.png'].map(from => ({from, to: '[name][ext]'})),
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

// The TV app is packaged into a .wgt and loaded from local files,
// so it's one classic script without lazy-loaded chunks
const tizen = {
  ...shared("tizen"),
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
    path: path.resolve(__dirname, "dist/tizen"),
    clean: true,
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'tizen/index.html',
      scriptLoading: 'defer',
      styles,
    }),
    new CopyPlugin({
      patterns: [
        'tizen/config.xml',
        {from: 'pwa/play-192.png', to: 'icon.png'},
      ].map(p => typeof p == 'string' ? {from: p, to: '[name][ext]'} : p),
    }),
  ],
};

export default [pwa, tizen];
