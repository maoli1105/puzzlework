import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export interface AuthRequest extends Request {
  user?: {
    id:         string;
    email:      string;
    role:       string;
    company_id: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '認証が必要です' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      id: string; email: string; role: string; company_id: string;
    };
    req.user = {
      id:         payload.id,
      email:      payload.email,
      role:       payload.role,
      company_id: payload.company_id,
    };
    next();
  } catch {
    res.status(401).json({ error: 'トークンが無効です' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' });
    return;
  }
  next();
}

/** plan に基づく機能制限。companies テーブルの plan を JOIN して確認。 */
export function requirePlan(minPlan: 'pro' | 'enterprise') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // company_id は authenticate 後に確定している前提
    const { pool } = await import('../db');
    const { rows } = await pool.query(
      'SELECT plan FROM companies WHERE id = $1', [req.user!.company_id]
    );
    const plan: string = rows[0]?.plan ?? 'free';
    const order: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
    if ((order[plan] ?? 0) < order[minPlan]) {
      res.status(402).json({ error: `この機能には ${minPlan} プラン以上が必要です` });
      return;
    }
    next();
  };
}
