import HtmlWebpackPlugin from "html-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// the stylesheet is inlined into the HTML
const styles = fs.readFileSync(path.resolve(__dirname, "src/styles.css"), "utf8");

// '#platform' picks the platform-specific module
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

export default [pwa];
