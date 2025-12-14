import express from 'express';
import { getCircuitStatus } from '../utils/httpClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Return circuit breaker status for external services
router.get('/circuit-breakers', (req, res) => {
  try {
    const status = getCircuitStatus();
    logger.debug({ status }, 'Returning circuit breaker status');
    res.json({ circuits: status });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to retrieve circuit status');
    res.status(500).json({ error: 'Failed to retrieve circuit status' });
  }
});

export default router;
