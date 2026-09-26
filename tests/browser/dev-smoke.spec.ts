import { test, expect } from '@playwright/test';

test('Vite hot reload and game sockets coexist without errors', async ({ page }) => {
  const errors: string[] = [];
  const sockets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/');
  expect(errors).toEqual([]);
  await page.locator('#nickname').fill('개발서버확인');
  await page.getByRole('button', { name: /혼자 연습/ }).click();
  await expect(page.locator('.lobby')).toBeVisible();
  await page.getByRole('button', { name: '준비 완료', exact: true }).click();
  await page.getByRole('button', { name: /경매 시작/ }).click();
  await expect(page.locator('.auction-page')).toBeVisible();
  await page.getByRole('button', { name: /나만의 비밀 미션/ }).click();
  const mission = await page.locator('.mission-content h3').innerText();
  await page.reload();
  await expect(page.locator('.auction-page')).toBeVisible();
  await page.getByRole('button', { name: /나만의 비밀 미션/ }).click();
  await expect(page.locator('.mission-content h3')).toHaveText(mission);
  expect(sockets.some((url) => url.includes('token='))).toBe(true);
  expect(sockets.some((url) => /\/[A-Z0-9]{6}\?sessionId=/.test(url))).toBe(true);
  await page.getByRole('button', { name: /^나가기/ }).click();
  await expect(page.locator('.landing')).toBeVisible();
  expect(errors).toEqual([]);
});
