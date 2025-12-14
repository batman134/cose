import express from 'express';
import { Shipment } from '../models/shipment.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const shipments = await Shipment.find();
  res.json(shipments);
});

export default router;
