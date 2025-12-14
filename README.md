(This repository contains a microservices demo with an NGINX API Gateway, auth, order, payment, inventory, customer, notification and shipment services.)

Resilience testing
- Run the included circuit-breaker test to simulate Payment service failures and verify circuit behaviour: `npm run test:resilience` (requires Docker Compose + Node installed).

