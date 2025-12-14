#!/usr/bin/env node
// scripts/assert_metrics.js
// Trigger endpoints to generate metrics, then query Prometheus to assert

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

const gatewayItems = 'http://localhost:8080/api/items';
const customerHealth = 'http://localhost:3003/health';
const inventoryHealth = 'http://localhost:3002/health';
const prometheusQuery = (q) => `http://localhost:9090/api/v1/query?query=${encodeURIComponent(q)}`;

async function req(url, opts){
  try{
    const res = await fetch(url, opts);
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  }catch(err){
    return { ok:false, err: String(err) };
  }
}

async function triggerTraffic(){
  console.log('Triggering traffic: 10 requests via gateway -> /api/items');
  for(let i=0;i<10;i++){
    const r = await req(gatewayItems);
    process.stdout.write(r.ok ? '.' : 'x');
    await sleep(100);
  }
  console.log('\nTriggering local health endpoints for customer & inventory');
  await req(customerHealth);
  await req(inventoryHealth);
}

async function queryProm(q){
  const url = prometheusQuery(q);
  const r = await req(url);
  if(!r.ok) return { ok:false, status: r.status, body: r.body };
  try{ return { ok:true, json: JSON.parse(r.body) }; }catch(e){ return { ok:false, err: 'invalid json' }; }
}

function checkResult(json){
  if(!json || json.status !== 'success') return false;
  const results = json.data && json.data.result;
  return Array.isArray(results) && results.length>0;
}

async function main(){
  if(typeof fetch === 'undefined'){
    console.error('Node does not have fetch available. Use Node 18+ or install a fetch polyfill.');
    process.exit(2);
  }

  await triggerTraffic();
  // give Prometheus a moment to scrape (>= one scrape_interval which is 5s)
  console.log('Waiting 6s for Prometheus to scrape...');
  await sleep(6000);

  const queries = [
    { name: 'inventory-service', q: 'http_requests_total{job="inventory-service"}' },
    { name: 'customer-service', q: 'http_requests_total{job="customer-service"}' },
  ];

  let allFound = true;
  for(const entry of queries){
    process.stdout.write(`Querying Prometheus for ${entry.name}... `);
    const res = await queryProm(entry.q);
    const ok = res.ok && checkResult(res.json);
    console.log(ok ? 'FOUND' : 'MISSING');
    if(!ok) allFound = false;
  }

  if(allFound){
    console.log('Metrics assert: SUCCESS');
    process.exit(0);
  } else {
    console.error('Metrics assert: FAILED (some metrics missing)');
    process.exit(1);
  }
}

main();
