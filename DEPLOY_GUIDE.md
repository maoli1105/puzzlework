# PuzzleWork デプロイガイド

## 構成

```
フロントエンド (Vite/React) → Nginx または Railway/Render で静的配信
バックエンド  (Node.js)     → VPS または Railway/Render
データベース  (PostgreSQL)   → VPS 上の PostgreSQL または managed DB
```

---

## 推奨: Railway（最も簡単）

### 1. Railway アカウント作成
https://railway.app でアカウントを作成（GitHub 連携推奨）

### 2. PostgreSQL を追加
- New Project → Add a Service → Database → PostgreSQL
- DATABASE_URL が自動生成される

### 3. バックエンドをデプロイ
```bash
# railway CLI をインストール
npm install -g @railway/cli
railway login

# backendディレクトリでデプロイ
cd backend
railway init
railway up
```

Environment Variables に以下を設定:
```
DATABASE_URL=<PostgreSQL の URL>
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" で生成>
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
PORT=3002
```

### 4. フロントエンドをデプロイ（Vercel 推奨）
```bash
npm install -g vercel
cd frontend

# .env.production を作成
echo "VITE_API_URL=https://your-backend.railway.app/api" > .env.production

vercel
```

---

## VPS の場合（さくら/ConoHa）

### 1. サーバー準備
```bash
# Node.js インストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL インストール
sudo apt-get install -y postgresql postgresql-contrib

# PM2 インストール（プロセス管理）
npm install -g pm2
```

### 2. PostgreSQL セットアップ
```bash
sudo -u postgres psql
CREATE DATABASE puzzlework;
CREATE USER puzzlework_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE puzzlework TO puzzlework_user;
\q
```

### 3. アプリをサーバーに転送
```bash
# リポジトリをクローンまたはrsync
git clone https://github.com/your-repo/puzzlework.git
cd puzzlework
```

### 4. バックエンド起動
```bash
cd backend
cp .env.example .env
# .env を編集して本番の値を設定

npm install
npm run build
npm run migrate  # マイグレーション実行

# PM2 で起動（サーバー再起動後も自動起動）
pm2 start dist/server.js --name puzzlework-api
pm2 save
pm2 startup
```

### 5. フロントエンドビルド
```bash
cd frontend
echo "VITE_API_URL=/api" > .env.production
npm install
npm run build
# dist/ を Nginx で配信
```

### 6. Nginx 設定
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # フロントエンド（静的ファイル）
    root /var/www/puzzlework/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # バックエンド API プロキシ
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

---

## 更新手順（データを消さずにアップデート）

```bash
cd /path/to/puzzlework

# 1. 最新コードを取得
git pull

# 2. デプロイ（ビルド → マイグレーション → 再起動）
bash deploy.sh
```

`deploy.sh` が自動で:
- バックエンドをビルド
- **新しいマイグレーションだけ** 適用（既適用はスキップ）
- バックエンドを再起動
- フロントエンドをビルド

---

## 費用の目安

| 構成 | 月額 |
|------|------|
| Railway (Hobby plan) | 無料〜$5 |
| さくら VPS 512MB | ¥660 |
| ConoHa VPS 1GB | ¥880 |
| Vercel (Frontend) | 無料 |
| ドメイン | ¥100〜500/月 |

10〜30人規模なら月2,000円以内で十分です。

---

## 本番環境の必須確認

- [ ] `JWT_SECRET` をランダム文字列（64文字以上）に変更
- [ ] `NODE_ENV=production` を設定
- [ ] `FRONTEND_URL` を実際のドメインに設定
- [ ] SSL 証明書を設定（Let's Encrypt / Certbot）
- [ ] PostgreSQL の定期バックアップを設定
