// Read-only provider/chain/database diagnostics, except one shared quota check.
require('@next/env').loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../tests/tsconfig.json');
require('ts-node/register/transpile-only'); require('tsconfig-paths/register');
const fs=require('fs'),path=require('path'),{createHash,randomUUID}=require('crypto');
const {PublicKey}=require('@solana/web3.js');
const {createClient}=require('@supabase/supabase-js');
const {getServerConnection,assertDevnetCluster}=require('../src/server/rpc');
const {pantaCredentials}=require('../src/server/pantaService');
const {PANTA_PROGRAM,pantaConfigAddress,pantaChainConfig}=require('../src/server/pantaProtocol');
async function main(){
  const rpc=getServerConnection();await assertDevnetCluster(rpc);
  const report={checkedAt:new Date().toISOString(),network:'devnet',solana:{genesis:await rpc.getGenesisHash()},database:{},provider:{}};
  const [program,config]=await rpc.getMultipleAccountsInfo([PANTA_PROGRAM,pantaConfigAddress],'confirmed');
  report.solana.panta={program:PANTA_PROGRAM.toBase58(),executable:!!program?.executable,config:pantaConfigAddress.toBase58(),configBytes:config?.data.length,
    configuredUsdcMint:config?.data.length>=276?new PublicKey(config.data.subarray(244,276)).toBase58():null};
  try{await pantaChainConfig();report.solana.panta.ready=true;}catch(e){report.solana.panta.ready=false;report.solana.panta.code=e.code||'CHAIN_UNAVAILABLE';}
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);
  for(const table of ['panta_lifecycle_markets','panta_issuer_reservations']){
    const result=await db.from(table).select(table==='panta_lifecycle_markets'?'network,mint,stage,status,failure_code,source_signature,source_slot,anchor_time,deadline,create_signature,baseline,final_snapshot':'network,mint,stage,units');
    report.database[table]={ok:!result.error,rows:result.data,errorCode:result.error?.code};
  }
  for(const [name,args] of [
    ['consume_panta_request_budget',{p_bucket:createHash('sha256').update('streetfun:panta:environment-check').digest('hex')}],
    ['reserve_panta_issuer_budget',{p_network:'devnet',p_mint:PublicKey.default.toBase58(),p_stage:'pre-graduation',p_units:0,p_limit:100}],
    ['lease_panta_lifecycle',{p_network:'devnet',p_mint:PublicKey.default.toBase58(),p_stage:'pre-graduation',p_lease:randomUUID()}],
  ]) {const r=await db.rpc(name,args);report.database[name]={exists:!r.error,errorCode:r.error?.code};}
  const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const denied=await anon.from('panta_lifecycle_markets').select('mint').limit(1);
  report.database.anonymousLifecycleRead={denied:denied.error?.code==='42501',errorCode:denied.error?.code};
  const {url,key}=pantaCredentials();
  for(const route of ['/whoami/','/markets/?limit=1']){
    const r=await fetch(url+route,{headers:{'X-Api-Key':key},redirect:'error',signal:AbortSignal.timeout(10000)});const body=await r.json();
    report.provider[route]={httpStatus:r.status,...(route==='/whoami/'?{canCreateMarkets:body.canCreateMarkets}: {marketIds:(body.items||[]).map(item=>item.marketId)})};
  }
  const output=path.resolve('artifacts/panta-completion-2026-10-08/environment.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.code||'ENVIRONMENT_CHECK_FAILED');process.exitCode=1;});
