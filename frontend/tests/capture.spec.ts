import { test } from '@playwright/test';

test('capture workspace', async ({ page }) => {
  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login');
  
  // 画面の初期状態をキャプチャ
  await page.screenshot({ path: 'login_initial.png' });
  console.log('Initial screen captured.');

  console.log('Filling credentials...');
  await page.fill('input[type="email"]', 'admin@puzzle.co.jp');
  await page.fill('input[type="password"]', 'password123');
  
  console.log('Clicking login...');
  await page.click('button[type="submit"]');

  // 少し待って、エラーメッセージがあるか、あるいは遷移するかを観察
  await page.waitForTimeout(5000);

  // 現在のURLを出力
  console.log(`Current URL: ${page.url()}`);
  await page.screenshot({ path: 'login_result.png' });
  console.log('Result screen captured.');

  console.log('Waiting for navigation to board...');
  // 遷移先URLのチェック
  if (page.url().includes('/board')) {
    console.log('Successfully navigated to /board!');
  } else {
    console.error('Navigation to /board failed. URL is still: ' + page.url());
  }

  console.log('Navigating to workspace directly...');
  await page.goto('http://localhost:3000/workspace');
  await page.waitForTimeout(3000); // 描画待ち
  
  console.log('Taking workspace screenshot...');
  const path = 'workspace_logged_in.png';
  await page.screenshot({ path, fullPage: true });
  console.log(`Workspace screenshot saved to ${path}`);
});
