import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import pieceRoutes from './routes/pieces';
import userRoutes from './routes/users';
import companyRoutes from './routes/companies';
import marketplaceRoutes from './routes/marketplace';
import agentRoutes from './routes/agent';
import projectRoutes from './routes/projects';
import leaveRoutes from './routes/leave';
import okrRoutes from './routes/okrs';
import retroRoutes from './routes/retros';
import notificationRoutes from './routes/notifications';
import shareRoutes from './routes/share';
import sprintRoutes from './routes/sprints';
import aiRoutes from './routes/ai';
import flowRoutes from './routes/flow';
import demoRoutes from './routes/demo';
import proposalRoutes from './routes/proposals';
import subtaskRoutes from './routes/subtasks';

dotenv.config();

const app = express();

// CORS: 複数オリジン対応（カンマ区切りで設定可能）
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // サーバー間リクエスト（originなし）または許可リストに含まれる場合は許可
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/pieces', pieceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/okrs', okrRoutes);
app.use('/api/retros', retroRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/sprints', sprintRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flow', flowRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api', subtaskRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── 集中エラーハンドラー ────────────────────────────────────────────────────
// try/catch で next(err) した場合や、Express が未捕捉エラーを受け取った場合に到達
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  process.stderr.write(`[Express Error] ${err.message}\n${err.stack ?? ''}\n`);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

export default app;
