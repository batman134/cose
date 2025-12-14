This Postman collection helps test API Gateway auth flows.

Files:
- postman_collection.json — import into Postman.

Requests:
1. Auth - Login (POST /auth/login) — saves `accessToken` to environment variable.
2. Auth - Validate (GET /auth/validate-test) — verifies the debug validate endpoint returns `X-User-*` headers. Note: this route may be removed when debugging is complete; use /auth/validate via auth_request behavior instead.
3. Customers - Get list (GET /api/customers) — should return customers when auth passes.

Resilience / Circuit breaker testing (Payment)
- Toggle Payment service debug fail to simulate failures: POST /api/payments/debug/fail with body `{ "forceFail": true }` (Authorization required)
	- If you edited the Payment service code to add debug endpoints, rebuild the container first:
		```powershell
		docker compose up -d --build payment-service
		```
- Create an order to exercise payment call: POST /api/orders (Authorization required)
- Check circuit breaker status: GET /debug/circuit-breakers (Authorization required)
	- Optionally set Postman environment variable `PAYMENT_KEY` to `http://payment-service:3004` and `EXPECT_CIRCUIT` to `OPEN` so the request's test will assert it.
- Reset Payment debug fail: POST /api/payments/debug/fail with `{ "forceFail": false }` to recover service.
	- After reset, set `EXPECT_CIRCUIT` to `CLOSED` and use `Debug - Circuit Breakers` to assert the circuit recovered.

Notes:
- If you remove `/auth/validate-test` from `nginx.conf`, the second request will no longer work; it's intended as a debug helper.
- Set a Postman environment variable `accessToken` or let the collection save it automatically after running the login request.

Quick Postman test run (Circuit breaker scenario):
1. Import `postman_collection.json` into Postman.
2. Create an Environment with variables: `accessToken`, `PAYMENT_KEY` = `http://payment-service:3004`, `EXPECT_CIRCUIT` if desired.
3. Run `Auth - Login` to populate `accessToken`.
4. Run `Payments - Toggle Fail (debug)` to set `forceFail: true`.
5. Use the Collection Runner to run `Order - Create` for 15-25 iterations (delay 100ms) to exercise the circuit.
6. Run `Debug - Circuit Breakers` to check circuit state; if you set `EXPECT_CIRCUIT` it will assert the expected state.
7. Run `Payments - Reset Fail (debug)` to clear failure mode.
8. Wait 30s, run `Debug - Circuit Breakers` again to verify the circuit is recovering (HALF_OPEN/CLOSED).