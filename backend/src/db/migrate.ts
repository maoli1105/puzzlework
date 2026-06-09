import fs from 'fs';
import path from 'path';
import { pool } from './index';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');

  // schema_migrations テーブルを確実に作成
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);

  // 適用済みのマイグレーションを取得
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r: { filename: string }) => r.filename));

  const files = fs.readdirSync(migrationsDir).sort();
  let ran = 0;

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    if (applied.has(file)) {
      console.log(`  skip: ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running: ${file}`);

    // トランザクションで実行 — 失敗しても他のマイグレーションを壊さない
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`  ✓ ${file}`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration failed [${file}]: ${err}`);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(ran > 0
    ? `Migration complete. ${ran} migration(s) applied.`
    : 'Already up to date.'
  );
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
