import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import matchRoutes from './routes/matches';
import groupRoutes from './routes/groups';
import predictionRoutes from './routes/predictions';
import rankingRoutes from './routes/ranking';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Bolão Copa 2026' }));

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/ranking', rankingRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

export default app;
