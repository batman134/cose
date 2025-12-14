import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'change_refresh_secret';
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || '7d';

// Simple in-memory users (for demo). In production use a real user store.
const users = [
  {
    id: 'u1',
    username: 'admin',
    passwordHash: bcrypt.hashSync('password', 10),
    role: 'admin'
  },
  {
    id: 'u2',
    username: 'customer',
    passwordHash: bcrypt.hashSync('secret', 10),
    role: 'customer'
  }
];

function generateAccessToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function generateRefreshToken(user) {
  return jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

export async function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return res.json({ accessToken, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
}

export async function refreshHandler(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = users.find(u => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'invalid refresh token' });
    const accessToken = generateAccessToken(user);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
}

// Used by nginx auth_request subrequest. Should return 200 + headers when valid.
export async function validateHandler(req, res) {
  console.log('[auth-validate] incoming headers:', req.headers);
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).send('missing token');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // set headers for nginx to read
    res.setHeader('X-User-Id', payload.sub);
    res.setHeader('X-User-Role', payload.role || 'customer');
    return res.status(200).json({ ok: true, sub: payload.sub, role: payload.role });
  } catch (err) {
    return res.status(401).send('invalid token');
  }
}

export default {};
