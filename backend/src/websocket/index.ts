// ============================================================
// WebSocket管理
// ピース遷移・通知のリアルタイム配信
// + カーソル共有（cursor_move / cursor_leave）
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { WSEvent } from '../types';

interface ClientMeta {
  ws:        WebSocket;
  userId:    string;
  companyId: string;
  name:      string;
}

// userId → クライアント情報
const clients = new Map<string, ClientMeta>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url   = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');

    let userId:    string | null = null;
    let companyId: string | null = null;
    let userName:  string        = 'Unknown';

    try {
      const decoded = jwt.verify(token || '', process.env.JWT_SECRET!) as {
        id: string; company_id: string;
      };
      userId    = decoded.id;
      companyId = decoded.company_id;

      // ユーザー名をDBから取得
      const row = await pool.query<{ name: string }>(
        'SELECT name FROM users WHERE id = $1', [userId]
      );
      if (row.rows.length > 0) userName = row.rows[0].name;
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    clients.set(userId!, { ws, userId: userId!, companyId: companyId!, name: userName });

    // ─── メッセージ受信（クライアント→サーバー→他クライアント）─────────────
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; x?: number; y?: number };

        if (msg.type === 'cursor_move' && typeof msg.x === 'number' && typeof msg.y === 'number') {
          // 同社の他ユーザーにブロードキャスト
          const event: WSEvent = {
            type: 'cursor_move',
            payload: {
              userId:    userId!,
              name:      userName,
              x:         msg.x,
              y:         msg.y,
              timestamp: Date.now(),
            },
          };
          broadcastToCompanyExcept(companyId!, userId!, event);
        }
      } catch { /* malformed message — ignore */ }
    });

    ws.on('close', () => {
      if (!userId) return;
      clients.delete(userId);
      // 離脱通知
      const leaveEvent: WSEvent = {
        type: 'cursor_leave',
        payload: { userId },
      };
      broadcastToCompanyExcept(companyId!, userId, leaveEvent);
    });
  });
}

// 同社の指定ユーザー以外にブロードキャスト
function broadcastToCompanyExcept(companyId: string, excludeUserId: string, event: WSEvent) {
  const msg = JSON.stringify(event);
  for (const [uid, meta] of clients.entries()) {
    if (uid === excludeUserId) continue;
    if (meta.companyId !== companyId) continue;
    if (meta.ws.readyState === WebSocket.OPEN) {
      meta.ws.send(msg);
    }
  }
}

// 特定ユーザーへ通知送信
export function notifyUser(userId: string, event: WSEvent) {
  const meta = clients.get(userId);
  if (meta && meta.ws.readyState === WebSocket.OPEN) {
    meta.ws.send(JSON.stringify(event));
  }
}

// 企業内全ユーザーへブロードキャスト（管理者向けアラート等）
export function broadcastToCompany(
  companyUserIds: string[],
  event: WSEvent
) {
  for (const uid of companyUserIds) {
    notifyUser(uid, event);
  }
}
