Resilience Patterns and Implementation

Resilience is the ability of a system to handle failures gracefully and continue operating in a degraded mode rather than completely failing.

1. Example of Cascading Failures
When one microservice fails, it can cause a domino effect that brings down the entire system:

Scenario: Payment service is down
Without Resilience:
User 10 API Gateway 10 Order Service 10 Payment Service (DOWN)
\nTIMEOUT (30s)
\nOrder fails
\nUser waits 30 seconds for error!
With Multiple Users:
100 concurrent users 10 30s timeout = All threads blocked!
\nOrder Service crashes!
\nOther services can't reach it
\nENTIRE SYSTEM DOWN!
This is called a Cascading Failure - one service failure brings down the entire system.

2. Key Resilience Patterns
1. Circuit Breaker - Stop calling failing services (like an electrical circuit breaker)
2. Retry with Exponential Backoff - Automatically retry transient failures with increasing delays
3. Timeout - Don't wait forever for responses
4. Fallback - Provide alternative responses when primary service fails
5. Bulkhead - Isolate resources to prevent total failure
6. Rate Limiting - Protect services from overload

3. Required Features (Applied in Project)

Feature 1: Circuit Breaker for Critical Services (Payment)
- Implemented: `services/order/src/utils/httpClient.js` contains a CircuitBreaker class (percent-based)
- Behavior (configured in code):
  - CLOSED (Normal): Requests pass through normally
  - OPEN (Failed): After 50% failure rate across a minimum of 10 requests, stop calling the service for 30 seconds
  - HALF-OPEN (Testing): Send one test request to check if the service recovered
- Configuration values in code:
  - Failure threshold: 50% (failureThresholdPercent: 0.5)
  - Timeout: per-request timeout (Payment: 5000ms)
  - Reset timeout (recoveryTimeMs): 30 seconds
  - Minimum requests before evaluation: 10
- Location: `services/order/src/routes/orders.js` sets breaker config for Payment calls

Feature 2: Retry with Exponential Backoff
- Implemented in: `services/order/src/utils/httpClient.js` (requestWithRetry)
- Strategy:
  - Total attempts: 4 (initial + up to 3 retries)
  - Backoff delays: 1s, 2s, 4s
  - Jitter: ±30% added to delays to avoid thundering herd
  - Retries only on: network errors, timeouts, 5xx server errors
  - No retries on: 4xx client errors

Feature 3: Timeout Configuration (All inter-service calls)
- Implemented by passing explicit `timeout` param to axios via `requestWithRetry` calls.
- Values used in Order service:
  - Customer Service: 3 seconds
  - Inventory Service: 3 seconds
  - Payment Service: 5 seconds
  - Shipping Service: 5 seconds
  - Notification Service: 10 seconds
- You can tune these values via environment variables or constants in code.

Feature 4: Fallback Strategy
- Implemented fallbacks in the Order service:
  - Payment Service Down: Order will be stored with status `PENDING_PAYMENT`, and a `payment_pending` event is published to RabbitMQ for later processing.
  - Notification/Customer fallbacks TBD (e.g., queue notifications, use cached customer data).
- Payment service now consumes `payment_pending` messages and attempts to process the payment asynchronously.

Feature 5: Rate Limiting (Optional)
- Rate limiting is configured via NGINX rate-limiting zones in `gateway/nginx.conf`.
- For application-level rate limiting, add `express-rate-limit` or other middleware.

4. Technology-specific Libraries (recommended)
Node.js:
- opossum (Circuit Breaker) — alternative to custom implementation
- axios-retry (Retry)
- express-rate-limit (Rate Limiting)
- node-cache (Caching for fallback)

Other languages: Spring Boot: resilience4j, Python: pybreaker/tenacity.

5. Summary: Implementation Steps and What I Did
Step 1: Add Circuit Breaker to Payment Service Calls
- Implemented percentage-based circuit breaker in `services/order/src/utils/httpClient.js`.
- Configured for Payment service from `orders.js`.

Step 2: Implement Retry Logic
- Added exponential backoff with jitter and retry rules to `requestWithRetry`.

Step 3: Set Timeouts
- Added explicit timeout values per-service in `orders.js` and pass them to `requestWithRetry`.

Step 4: Add Fallback Strategies
- Implemented payment fallback: orders are marked `PENDING_PAYMENT` and `payment_pending` event is published.
- Payment consumer now processes `payment_pending` events (async fallback handler).

Step 5: Rate Limiting (Optional)
- Gateway-level rate-limiting already present in `gateway/nginx.conf` zones.

6. Testing & Validation
Test 1: Circuit Breaker Behavior
- Trigger failures on the Payment service (e.g., stop the container or force 500 errors) and verify:
  - After at least 10 requests and >=50% failures, the breaker opens and immediate errors are returned (EOPEN). 
  - After 30 seconds, verification requests are tried and breaker transitions to HALF_OPEN.

Test 2: Retry Behavior
- Simulate intermittent network failures: verify requestWithRetry retries up to 3 times with increasing delays and jitter.

Test 3: Fallback Payment
- Stop Payment service and attempt orders: orders should be created with `PENDING_PAYMENT` and `payment_pending` events published to RabbitMQ. Payment consumer should pick these up once service is available.

See code comments and files for where to tune runtime values.


If you'd like, I can:
- Add `opossum` and replace the custom breaker with it;
- Add unit/integration tests to simulate failures and assert circuit states;
- Add customer-service fallback (cache) for missing customer service;
- Add in-app rate-limiting using `express-rate-limit`.

7. Running the included circuit breaker test script
- **From repo root** run: `node scripts/test_circuit_breaker.js` (requires Docker Compose and Node installed).
- The script will: log in via the gateway, stop the `payment-service` container, issue multiple order requests to trigger failures, fetch the circuit status via the debug endpoint, then start `payment-service` again.
- Use env vars to override defaults: `GATEWAY`, `TEST_USER`, `TEST_PASS`.

7. Assertions script
- A test script is included to assert circuit breaker transitions: `scripts/assert_circuit_breaker.js`.
- Run it directly: `node scripts/assert_circuit_breaker.js` or via npm: `npm run test:resilience:assert`.
- This script will fail (exit code != 0) if the circuit does not open after failures or does not recover to CLOSED after service recovery.

8. Manual testing with Postman
- Import `gateway/postman_collection.json` into Postman and set a new Environment with `accessToken` variable (after login).
- Steps:
  1. Run `Auth - Login` to obtain `accessToken`.
  2. Hit `Payments - Toggle Fail (debug)` to set `forceFail:true` on Payment service.
  3. Trigger `Order - Create` repeatedly to exercise the Order -> Payment call. After several failed attempts (>= minRequests and 50%+ failures) the circuit should open.
  4. Use `Debug - Circuit Breakers` to verify Payment circuit state is `OPEN`.
  5. Run `Payments - Reset Fail (debug)` to clear `forceFail` and allow recovery.
  6. Use `Order - Create` and `Debug - Circuit Breakers` to verify the circuit progresses to `HALF_OPEN` then `CLOSED`.

