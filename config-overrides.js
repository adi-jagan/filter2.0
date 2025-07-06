const webpack = require('webpack');
const path = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = function override(config) {
  // Add Node Polyfill Plugin
  config.plugins.push(new NodePolyfillPlugin());
  
  // Add our custom loader for node: scheme imports
  config.module.rules.unshift({
    test: /\.m?js$/,
    enforce: 'pre',
    use: [
      { loader: path.resolve('./node-scheme-loader.js') }
    ],
    include: /node_modules/
  });

  // Add resolver for node: scheme
  config.resolve.fallback = {
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "assert": require.resolve("assert"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "url": require.resolve("url"),
    "util": require.resolve("util"),
    "path": require.resolve("path-browserify"),
    "zlib": require.resolve("browserify-zlib"),
    "querystring": require.resolve("querystring-es3"),
    "vm": require.resolve("vm-browserify"),
    // Node.js modules that don't have browser equivalents
    "fs": false,
    "net": false,
    "tls": false,
    "module": false,
    "child_process": false,
    "worker_threads": false,
    "async_hooks": false,
    "dns": false,
    "http2": false,
    "readline": false,
    "diagnostics_channel": false
  };

  // This handles the 'node:' scheme URLs
  // Set up aliases for node: scheme imports
  config.resolve.alias = {
    ...config.resolve.alias,
    "node:crypto": require.resolve("crypto-browserify"),
    "node:stream": require.resolve("stream-browserify"),
    "node:assert": require.resolve("assert"),
    "node:http": require.resolve("stream-http"),
    "node:https": require.resolve("https-browserify"),
    "node:os": require.resolve("os-browserify/browser"),
    "node:url": require.resolve("url"),
    "node:util": require.resolve("util"),
    "node:path": require.resolve("path-browserify"),
    "node:fs": false,
    "node:zlib": require.resolve("browserify-zlib")
  };

  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  ]);
  
  return config;
};
