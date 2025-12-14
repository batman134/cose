#!/usr/bin/env node
// Integration test: assert circuit breaker opens and recovers for Payment service
// Usage: node scripts/assert_circuit_breaker.js

const axios = require('axios');
const { execSync } = require('child_process');

const GATEWAY = process.env.GATEWAY || 'http://localhost:8080';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'password';
const PAYMENT_KEY = process.env.PAYMENT_KEY || 'http://payment-service:3004';
const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID;
let effectiveCustomerId = TEST_CUSTOMER_ID;
const ATTEMPTS = parseInt(process.env.TEST_ATTEMPTS || '20', 10);
const MIN_REQUESTS = parseInt(process.env.MIN_REQUESTS || '10', 10);
const RECOVERY_WAIT_MS = parseInt(process.env.RECOVERY_WAIT_MS || '35000', 10); // default > 30s
const POLL_INTERVAL_MS = 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(){
  for (let i=0;i<5;i++){
    try{
      const r = await axios.post(`${GATEWAY}/auth/login`, { username: USER, password: PASS }, { timeout: 5000 });
      return r.data.accessToken;
    } catch (e) {
      console.warn('Login attempt failed, retrying...', e.message);
      await sleep(1000);
    }
  }
  throw new Error('Failed to login');
}

async function createOrder(token){
  const payload = { customerId: effectiveCustomerId || 'u1', items: [{ productId: 'p1', quantity: 1 }], total: 9.99 };
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

function stopPayment() {
  try{ execSync('docker compose stop payment-service', { stdio: 'inherit' }); } catch(err) { console.warn('Failed to stop container:', err.message); }
}
function startPayment(){
  try{ execSync('docker compose start payment-service', { stdio: 'inherit' }); } catch(err) { console.warn('Failed to start container:', err.message); }
}

(async function main(){
  console.log('1) Logging in...');
  const token = await login();
  console.log('access token retrieved');

  // Ensure a valid test customer exists (optional)
  if (!TEST_CUSTOMER_ID) {
    try {
      const r = await axios.post(`${GATEWAY}/api/customers`, { name: 'test-user', email: `test-${Date.now()}@example.com`, password: 'testpass' }, { headers: { Authorization: `Bearer ${token}`}, timeout: 5000 });
      const created = r.data.id || r.data._id;
      console.log('Created test customer id', created);
      effectiveCustomerId = created;
    } catch (e) {
      console.warn('Could not create test customer:', e.message);
    }
  }

  // Enable payment debug mode to force 500 responses (safer than stopping container)
  console.log('2) Enabling payment debug fail mode to simulate failures');
  try {
    await axios.post(`${GATEWAY}/api/payments/debug/fail`, { forceFail: true, delayMs: 0 }, { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 });
  } catch (e) {
    console.warn('Failed to enable payment debug fail mode via gateway:', e.message);
  }

  // Send requests to trigger failures
  console.log('3) Issuing order requests to trigger failures');
  let successes = 0;
  let failures = 0;
  for (let i=0;i<ATTEMPTS;i++){
    process.stdout.write(`.${i+1}`);
    const r = await createOrder(token);
    if (r.err) failures++; else successes++;
    await sleep(100);
  }
  console.log('\nDone. Successes:', successes, 'Failures:', failures);

  // Poll circuit status until OPEN
  console.log('4) Polling for circuit to open (timeout 15s)');
  let opened = false;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const circuits = await getCircuits(token);
    const key = PAYMENT_KEY;
    const br = circuits?.circuits?.[key];
    if (br && br.state === 'OPEN') { opened = true; break; }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!opened) {
    console.error('Circuit did NOT open as expected');
    process.exit(1);
  }
  console.log('Circuit is OPEN');

  // Disable payment debug fail mode to allow recovery
  console.log(`5) Disabling payment debug fail mode and waiting ${RECOVERY_WAIT_MS}ms for recovery window`);
  try {
    await axios.post(`${GATEWAY}/api/payments/debug/fail`, { forceFail: false, delayMs: 0 }, { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 });
  } catch (e) {
    console.warn('Failed to disable payment debug fail mode via gateway:', e.message);
  }
  await sleep(RECOVERY_WAIT_MS);

  // Check that the breaker transitions to HALF_OPEN or CLOSED on a test request
  console.log('6) Polling for circuit to move to HALF_OPEN/CLOSED (timeout 30s)');
  let recovered = false;
  const deadline2 = Date.now() + 30000;
  while (Date.now() < deadline2) {
    const circuits = await getCircuits(token);
    const br = circuits?.circuits?.[PAYMENT_KEY];
    if (br && (br.state === 'HALF_OPEN' || br.state === 'CLOSED')) { recovered = true; break; }

    // Trigger a probe order to cause the breaker to transition from OPEN -> HALF_OPEN
    // (allowRequest flips to HALF_OPEN on the first call after recovery window)
    try {
      const probe = await createOrder(token);
      console.log('probe order:', probe.err ? JSON.stringify(probe.err) : probe.status);
    } catch (e) {
      console.warn('probe order error', e.message);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (!recovered) {
    console.error('Circuit did not recover to HALF_OPEN/CLOSED within timeout');
    process.exit(1);
  }
  console.log('Circuit recovered to HALF_OPEN/CLOSED');

  // Make note: final status should be CLOSED after a successful request to payment
  // Trigger a single order to cause a half-open test request
  console.log('7) Triggering single order to close circuit (if half-open)');
  const r2 = await createOrder(token);
  console.log('Order attempt result:', JSON.stringify(r2));

  // Verify final closed state
  const circuitsFinal = await getCircuits(token);
  const finalState = circuitsFinal?.circuits?.[PAYMENT_KEY]?.state;
  if (finalState !== 'CLOSED') {
    console.error('Circuit final state is not CLOSED:', finalState);
    process.exit(1);
  }

  console.log('Circuit closed successfully — test passed');
  process.exit(0);
})();
