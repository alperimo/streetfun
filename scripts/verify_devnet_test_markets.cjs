const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT ||= path.resolve(__dirname, "../tests/tsconfig.json");
require("ts-node/register/transpile-only");
require("tsconfig-paths/register");
require("./verify_devnet_test_markets.ts");
