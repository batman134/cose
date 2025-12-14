import express from 'express';
import bcrypt from 'bcrypt';
import { Customer } from '../models/customer.js';

const router = express.Router();

// list customers
router.get('/', async (req, res) => {
  const customers = await Customer.find();
  res.json(customers);
});

// get customer by id
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// create customer
router.post('/', async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const saltRounds = 10;
    const hashed = await bcrypt.hash(password, saltRounds);

    const customer = await Customer.create({ ...rest, password: hashed });
    res.status(201).json({ id: customer._id, email: customer.email, name: customer.name, role: customer.role });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
