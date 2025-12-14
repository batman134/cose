import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import { loginHandler, refreshHandler, validateHandler } from './authController.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Log incoming requests for debugging (temporary)
app.use((req, res, next) => {
  console.log('[auth-service] req:', req.method, req.url, req.headers && { auth: req.headers.authorization });
  next();
});

app.post('/auth/login', loginHandler);
app.post('/auth/refresh', refreshHandler);
app.get('/validate', validateHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth service listening on ${PORT}`);
});
