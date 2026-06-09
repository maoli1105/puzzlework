import dotenv from 'dotenv';
dotenv.config();

// ── 本番環境の必須チェック ──────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const WEAK_SECRETS = ['supersecret', 'secret', 'password', 'changeme', ''];
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (WEAK_SECRETS.includes(jwtSecret) || jwtSecret.length < 32) {
    process.stderr.write(
      '[FATAL] JWT_SECRET が本番環境に適していません。\n' +
      '  生成方法: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    process.stderr.write('[FATAL] DATABASE_URL が設定されていません。\n');
    process.exit(1);
  }
}

import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { setupWebSocket } from './websocket';
import { startNotificationCron } from './services/notificationCron';

// ─── グローバルエラーハンドラー ────────────────────────────────────────────
// 未捕捉の Promise rejection でプロセスが落ちないようにする
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  process.stderr.write(`[unhandledRejection] ${msg}\n`);
});

process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`[uncaughtException] ${err.message}\n${err.stack}\n`);
  // 致命的な場合のみ終了（DB接続不能など）
  if (err.message.includes('ECONNREFUSED') || err.message.includes('EADDRINUSE')) {
    process.exit(1);
  }
});

const PORT = parseInt(process.env.PORT || '3001');

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

server.listen(PORT, () => {
  process.stdout.write(`Server listening on port ${PORT}\n`);
  startNotificationCron();
});
