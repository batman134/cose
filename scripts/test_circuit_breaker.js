#!/usr/bin/env node
// Simple script to test circuit breaker behavior for Payment service
// Requires: node, docker compose installed, and Docker running
// Usage: node scripts/test_circuit_breaker.js

const axios = require('axios');
const { execSync } = require('child_process');

const GATEWAY = process.env.GATEWAY || 'http://localhost:8080';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'password';

async function login(){
  const r = await axios.post(`${GATEWAY}/auth/login`, { username: USER, password: PASS });
  return r.data.accessToken;
}

async function createOrder(token){
  const payload = {
    customerId: 'u1',
    items: [{ productId: 'p1', quantity: 1 }],
    total: 9.99
  };
  try{
    const r = await axios.post(`${GATEWAY}/api/orders`, payload, { headers: { Authorization: `Bearer ${token}`}, timeout: 10000 });
    return { status: r.status, data: r.data };
  } catch (err) {
    return { err: err.response ? { status: err.response.status, data: err.response.data } : err.message };
  }
}

async function getCircuits(token){
  try{ const r = await axios.get(`${GATEWAY}/debug/circuit-breakers`, { headers: { Authorization: `Bearer ${token}`}, timeout: 5000 }); return r.data; } catch(e) { return { error: e.message } }
}

(async function main(){
  console.log('1) Logging in...');
  const token = await login();
  console.log('access token retrieved');

  console.log('2) Stopping payment-service (docker compose stop payment-service)');
  try{ execSync('docker compose stop payment-service', { stdio: 'inherit' }); } catch(err) { console.warn('Failed to stop container:', err.message); }

  // Make many order requests to trigger failures
  const attempts = 15;
  const results = [];
  for (let i=0;i<attempts;i++){
    process.stdout.write(`.${i+1}`);
    const r = await createOrder(token);
    results.push(r);
    await new Promise(res => setTimeout(res, 100));
  }
  console.log('\nRequests done');

  console.log('Fetching circuit status...');
  const circuits = await getCircuits(token);
  console.log(JSON.stringify(circuits, null, 2));

  console.log('3) Starting payment-service...');
  try{ execSync('docker compose start payment-service', { stdio: 'inherit' }); } catch(err) { console.warn('Failed to start container:', err.message); }

  console.log('Done');
})();
