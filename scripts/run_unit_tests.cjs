// Load TypeScript through one CJS path on all supported Node versions. Node's
// native TS loader otherwise bypasses ts-node for Mocha's dynamic imports.
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../tests/tsconfig.json');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const Mocha = require('mocha');
const fs = require('fs');
const path = require('path');
const mocha = new Mocha({ timeout: 10000 });
for (const name of ['marketFormat.test.ts', 'receipt.test.ts', 'tradeStore.test.ts']) {
  mocha.addFile(path.resolve(__dirname, '../tests', name));
}
for (const name of fs.readdirSync(path.resolve(__dirname, '../tests/unit')).sort()) {
  if (name.endsWith('.test.ts')) mocha.addFile(path.resolve(__dirname, '../tests/unit', name));
}
mocha.loadFiles();
mocha.run(failures => { process.exitCode = failures ? 1 : 0; });
