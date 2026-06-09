import { Router } from 'express';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

function makeToken(user: { id: string; email: string; role: string; company_id: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, company_id: user.company_id },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// ── ログイン ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
    return;
  }
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) {
      res.status(400).json({ error: 'メールアドレスまたはパスワードが違います' });
      return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(400).json({ error: 'メールアドレスまたはパスワードが違います' });
      return;
    }
    const token = makeToken(user);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id, onboarded: user.onboarded ?? true },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 個人ワーカー登録（会社不要・個人アカウント）──────────────────
router.post('/register-worker', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: '全項目を入力してください' }); return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'パスワードは8文字以上にしてください' }); return;
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'このメールアドレスは既に使用されています' }); return;
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company_id)
       VALUES ($1, $2, $3, 'worker', NULL) RETURNING *`,
      [name, email, hash],
    );
    const token = makeToken(user);
    res.status(201).json({
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, company_id: null,
        company_name: null, plan: null,
        onboarded: user.onboarded ?? false,
      },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 会社登録（新規 admin + company を同時作成）────────────────────
router.post('/register', async (req, res) => {
  const { companyName, name, email, password } = req.body;
  if (!companyName || !name || !email || !password) {
    res.status(400).json({ error: '全項目を入力してください' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
    return;
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'このメールアドレスは既に使用されています' });
      return;
    }
    const hash = await bcrypt.hash(password, 12);

    // トランザクションで company + admin user を同時作成
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [company] } = await client.query(
        `INSERT INTO companies (name, plan) VALUES ($1, 'free') RETURNING *`,
        [companyName],
      );
      const { rows: [user] } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, company_id)
         VALUES ($1, $2, $3, 'admin', $4) RETURNING *`,
        [name, email, hash, company.id],
      );
      await client.query('COMMIT');

      const token = makeToken(user);
      res.status(201).json({
        user: {
          id: user.id, name: user.name, email: user.email,
          role: user.role, company_id: user.company_id,
          company_name: company.name, plan: company.plan,
        },
        token,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 招待トークン発行（admin のみ）────────────────────────────────
router.post('/invite', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' });
    return;
  }
  const role = (req.body.role as string) || 'worker';
  if (!['worker', 'admin'].includes(role)) {
    res.status(400).json({ error: '無効なロールです' });
    return;
  }
  const inviteEmail = (req.body.email as string | undefined)?.trim() || null;
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const { rows: [invite] } = await pool.query(
      `INSERT INTO invite_tokens (token, company_id, created_by, role)
       VALUES ($1, $2, $3, $4) RETURNING token, expires_at`,
      [token, req.user!.company_id, req.user!.id, role],
    );

    // 会社情報を取得してメール本文に使う
    const { rows: [company] } = await pool.query(
      'SELECT name FROM companies WHERE id = $1',
      [req.user!.company_id]
    );
    const inviterName = req.user!.email;
    const companyName = company?.name ?? 'チーム';
    const roleLabel = role === 'admin' ? '管理者' : 'ワーカー';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const joinUrl = `${frontendUrl}/join/${invite.token}`;

    let emailSent = false;
    if (resend && inviteEmail) {
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'PuzzleWork <onboarding@resend.dev>',
          to: inviteEmail,
          subject: `${companyName} からPuzzleWorkへの招待`,
          html: `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <!-- ヘッダー -->
        <tr>
          <td style="background:#111111;padding:24px 32px">
            <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em">PuzzleWork</span>
          </td>
        </tr>
        <!-- 本文 -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111111;letter-spacing:-0.01em">
              ${companyName} に招待されました
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6">
              ${inviterName} さんが、PuzzleWork の <strong>${companyName}</strong> ワークスペースに
              <strong>${roleLabel}</strong> として招待しています。
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#B46400;border-radius:6px">
                  <a href="${joinUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em">
                    招待を承諾して参加する
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;line-height:1.6">
              このリンクは7日間有効です。<br>
              ボタンが機能しない場合は以下のURLをブラウザに貼り付けてください:<br>
              <span style="font-family:monospace;color:#6b7280">${joinUrl}</span>
            </p>
          </td>
        </tr>
        <!-- フッター -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f3f4f6">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              心当たりのない場合はこのメールを無視してください。
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        });
        emailSent = true;
      } catch (emailErr) {
        console.warn('[invite] email送信失敗 (トークンは発行済み):', emailErr);
      }
    }

    res.json({ token: invite.token, expires_at: invite.expires_at, email_sent: emailSent });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 招待トークンで新規ユーザー登録 ───────────────────────────────
router.post('/join', async (req, res) => {
  const { token, name, email, password } = req.body;
  if (!token || !name || !email || !password) {
    res.status(400).json({ error: '全項目を入力してください' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
    return;
  }
  try {
    const { rows: [invite] } = await pool.query(
      `SELECT * FROM invite_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token],
    );
    if (!invite) {
      res.status(400).json({ error: '無効または期限切れの招待リンクです' });
      return;
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'このメールアドレスは既に使用されています' });
      return;
    }
    const hash = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 個人アカウントとして作成: company_id は NULL（企業とは membership で接続）
      const { rows: [user] } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, company_id)
         VALUES ($1, $2, $3, $4, NULL) RETURNING *`,
        [name, email, hash, invite.role],
      );
      await client.query(
        `UPDATE invite_tokens SET used_by = $1, used_at = NOW() WHERE id = $2`,
        [user.id, invite.id],
      );
      // company_memberships で企業と接続
      await client.query(
        `INSERT INTO company_memberships (user_id, company_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [user.id, invite.company_id, invite.role],
      );
      await client.query('COMMIT');

      const jwtToken = makeToken(user);
      const { rows: [company] } = await pool.query(
        'SELECT name, plan FROM companies WHERE id = $1', [invite.company_id]
      );
      res.status(201).json({
        user: {
          id: user.id, name: user.name, email: user.email,
          role: user.role, company_id: null,
          company_name: company?.name ?? null, plan: company?.plan ?? 'free',
          onboarded: user.onboarded ?? false,
        },
        token: jwtToken,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 招待トークン情報確認（参加前プレビュー）─────────────────────────
router.get('/invite-info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const { rows: [invite] } = await pool.query(
      `SELECT i.token, i.role, i.expires_at, i.used_at,
              c.name AS company_name, c.id AS company_id
       FROM invite_tokens i
       JOIN companies c ON c.id = i.company_id
       WHERE i.token = $1`,
      [token],
    );
    if (!invite) {
      res.status(404).json({ error: '招待リンクが見つかりません' }); return;
    }
    if (invite.used_at) {
      res.json({ ...invite, status: 'used' }); return;
    }
    if (new Date(invite.expires_at) < new Date()) {
      res.json({ ...invite, status: 'expired' }); return;
    }
    res.json({ ...invite, status: 'valid' });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 既存ユーザーが追加会社に参加（副業・マルチカンパニー）──────────
router.post('/join-existing', async (req, res) => {
  const { token, email, password } = req.body;
  if (!token || !email || !password) {
    res.status(400).json({ error: '全項目を入力してください' }); return;
  }
  try {
    // トークン検証
    const { rows: [invite] } = await pool.query(
      `SELECT * FROM invite_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token],
    );
    if (!invite) {
      res.status(400).json({ error: '無効または期限切れの招待リンクです' }); return;
    }

    // 既存ユーザー認証
    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    if (!user) {
      res.status(400).json({ error: 'メールアドレスまたはパスワードが違います' }); return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(400).json({ error: 'メールアドレスまたはパスワードが違います' }); return;
    }

    // 既に同社のメンバーでないかチェック
    const { rows: existing } = await pool.query(
      'SELECT 1 FROM company_memberships WHERE user_id = $1 AND company_id = $2',
      [user.id, invite.company_id],
    );
    if (existing.length > 0) {
      res.status(400).json({ error: '既にこのワークスペースのメンバーです' }); return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // メンバーシップ追加
      await client.query(
        `INSERT INTO company_memberships (user_id, company_id, role)
         VALUES ($1, $2, $3)`,
        [user.id, invite.company_id, invite.role],
      );
      // トークン使用済みマーク
      await client.query(
        `UPDATE invite_tokens SET used_by = $1, used_at = NOW() WHERE id = $2`,
        [user.id, invite.id],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 会社情報取得
    const { rows: [company] } = await pool.query(
      'SELECT name, plan FROM companies WHERE id = $1',
      [invite.company_id],
    );

    // JWT は既存のまま（primary company は変えない）。新しいトークン返却
    const jwtToken = makeToken(user);
    res.json({
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, company_id: user.company_id,
        company_name: company?.name, plan: company?.plan ?? 'free',
        onboarded: user.onboarded ?? true,
      },
      token: jwtToken,
      joined_company: { id: invite.company_id, name: company?.name, role: invite.role },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 招待トークン一覧（admin のみ）────────────────────────────────
router.get('/invites', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' }); return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.token, i.role, i.expires_at, i.used_at,
              u.name AS used_by_name
       FROM invite_tokens i
       LEFT JOIN users u ON u.id = i.used_by
       WHERE i.company_id = $1
       ORDER BY i.created_at DESC
       LIMIT 20`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── 自分の情報取得 ────────────────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.company_id, u.onboarded,
              c.name as company_name, c.plan
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [req.user!.id],
    );
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
