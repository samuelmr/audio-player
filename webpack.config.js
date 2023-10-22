import HtmlWebpackPlugin from "html-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: "production",     
  entry: "./audioplayer.js",
  output: {
    filename: "audioplayer.js",
    path: path.resolve(__dirname, "dist"),
    library: {
      type: "module",
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
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'index.html',
      // chunks: ['main']
    })
  ],
  experiments: {
    outputModule: true,
  },
};
/**
var path = require("path");
module.exports = {
  entry: [path.join(__dirname, "audioplayer.js")],
  output: {
    path: __dirname,
    filename: 'audioplayer.js'
  },
   resolve:{
  fallback: { path: require.resolve("path-browserify")}
  }
};
**/
