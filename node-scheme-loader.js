module.exports = function(source) {
  // Replace node:module imports with regular module imports
  return source.replace(/require\(['"]node:([^'"]+)['"]\)/g, "require('$1')")
    .replace(/from\s+['"]node:([^'"]+)['"]/g, "from '$1'")
    .replace(/import\s+['"]node:([^'"]+)['"]/g, "import '$1'");
};
