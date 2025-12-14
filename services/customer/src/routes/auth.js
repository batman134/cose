import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Customer } from '../models/customer.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Login: returns JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await Customer.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'changeme', { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    logger.error({ err: err.message }, 'Auth login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
