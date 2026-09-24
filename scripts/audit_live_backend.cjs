// Read-only by default. --reconcile replays existing, successful chain transactions
// into the index; it never signs, spends, mints, graduates or fabricates a trade.
require('@next/env').loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT = require('path').resolve('tests/tsconfig.json');
require('ts-node/register/transpile-only'); require('tsconfig-paths/register');
const fs = require('fs');
const { getServerConnection, assertConfiguredCluster } = require('../src/server/rpc');
const { decodeStreetfunInstructions, indexConfirmedTransaction } = require('../src/server/indexTransaction');
const { PROGRAM_ID } = require('../src/sdk/constants');
const { solanaTokenService } = require('../src/server/tokenData');
const { createServerSupabaseClient } = require('../src/server/supabase');
const { getTesseraCatalog, getTesseraAvailability } = require('../src/server/tessera');
(async () => {
  const connection = getServerConnection();
  const db = createServerSupabaseClient();
  const evidence = { checkedAt: new Date().toISOString(), genesisHash: await assertConfiguredCluster(connection), transactions: [], reconciliation: [] };
  evidence.assets = await getTesseraAvailability(connection, await getTesseraCatalog());
  const signatures = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 100 });
  for (const record of [...signatures].reverse()) {
    if (record.err) continue;
    try {
      const tx = await connection.getParsedTransaction(record.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (!tx) continue;
      const decoded = decodeStreetfunInstructions(tx);
      evidence.transactions.push({ signature: record.signature, slot: tx.slot, time: new Date(tx.blockTime * 1000).toISOString(),
        instructions: decoded.map(e => ({ name: e.name, accounts: e.instruction.accounts.map(a => a.toBase58()), logs: e.logs })),
        explorer: `https://explorer.solana.com/tx/${record.signature}?cluster=devnet`,
      });
      if (process.argv.includes('--reconcile')) {
        try { const result = await indexConfirmedTransaction(connection, record.signature, tx.slot); evidence.reconciliation.push({ signature: record.signature, indexed: result.indexed }); }
        catch (error) { evidence.reconciliation.push({ signature: record.signature, error: error.message }); }
      }
    } catch (error) { evidence.transactions.push({ signature: record.signature, error: error.name }); }
  }
  const started = Date.now();
  evidence.tokens = await solanaTokenService.getTokens();
  evidence.snapshotMs = Date.now() - started;
  const cached = Date.now(); await solanaTokenService.getTokens(); evidence.cachedSnapshotMs = Date.now() - cached;
  if (db) {
    const { data, error } = await db.from('trades').select('*').in('mint', evidence.tokens.map(t => t.mint));
    evidence.persistedTrades = data; evidence.databaseError = error;
  }
  fs.mkdirSync('audit', { recursive: true });
  fs.writeFileSync('audit/transaction-evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ transactions: evidence.transactions.length, reconciled: evidence.reconciliation.filter(r => r.indexed).length,
    reconciliationErrors: evidence.reconciliation.filter(r => r.error), tokens: evidence.tokens.length,
    persistedTrades: evidence.persistedTrades?.length, snapshotMs: evidence.snapshotMs, cachedSnapshotMs: evidence.cachedSnapshotMs }, null, 2));
})().catch(error => { console.error({ error: error.name, message: String(error.message).replace(/api-key=[^\s&]+/g, 'api-key=<redacted>') }); process.exitCode = 1; });
