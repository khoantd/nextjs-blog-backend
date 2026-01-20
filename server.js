// This wrapper file registers tsconfig-paths BEFORE loading the compiled application
// This allows Node.js to resolve @/ path aliases at runtime
const tsConfigPaths = require('tsconfig-paths');

// Configure path mappings for runtime
// The compiled files are in dist/, so we map @/* relative to dist/
const baseUrl = './dist';
const paths = {
  '@/*': ['*']  // Map @/lib/prisma to dist/lib/prisma (relative to baseUrl)
};

// Register the path mappings
tsConfigPaths.register({
  baseUrl,
  paths
});

// Now load the compiled application
require('./dist/index.js');
