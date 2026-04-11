import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';

const app = express();
app.use(express.json());

const port = Number(process.env.PORT) || 3000;
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vibloc-backend' });
});

app.use('/auth', authRouter);

app.listen(port, () => {
  console.log(`vibloc-backend listening on http://localhost:${port}`);
});
