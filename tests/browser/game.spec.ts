import { test, expect, type Page } from '@playwright/test';
import { MISSIONS } from '@oddbid/shared';

const collectionNotice = '수집 미션의 목표 물건이 이번 게임에 나오지 않을 수도 있어요.';

function watchErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(error.message));
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test('mobile entry, rules dialog, and validation are usable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  watchErrors(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('눈치는 필요하고');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('landing-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /새 경매장 열기/ }).click();
  await expect(page.getByRole('alert')).toContainText('닉네임');
  await page.getByRole('button', { name: '오류 메시지 닫기' }).click();
  await page.getByRole('button', { name: /게임 방법/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('100코인');
  await expect(page.getByRole('dialog')).toContainText('30종 중 5종');
  await expect(page.getByRole('dialog')).toContainText(collectionNotice);
  await noHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('오늘의 경매사 이름', { exact: false }).fill('테스트손님');
  await page.getByLabel('초대 코드 6자리').fill('BAD');
  await page.getByRole('button', { name: /^입장/ }).click();
  await expect(page.getByRole('alert')).toContainText('6자리');
  expect(errors).toEqual([]);
});

test('three browsers bid, restore a session, finish five rounds, and play again', async ({
  browser,
}, testInfo) => {
  const baseURL = 'http://127.0.0.1:2568';
  const contexts = await Promise.all([
    browser.newContext({ baseURL }),
    browser.newContext({ baseURL }),
    browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host, guest, mobile] = pages as [Page, Page, Page];
  const errors: string[] = [];
  pages.forEach((page) => watchErrors(page, errors));
  try {
    await host.goto('/');
    await host.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true });
    await host.locator('#nickname').fill('오리방장');
    await host.getByRole('button', { name: /새 경매장 열기/ }).click();
    await expect(host.locator('.ticket-code')).toBeVisible();
    await expect(host.locator('.invitation-ticket')).toContainText('30종 중 무작위 5종');
    await expect(host.locator('.invitation-ticket .collection-notice')).toHaveText(
      collectionNotice,
    );
    const code = (await host.locator('.ticket-code').innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(host.getByRole('button', { name: /경매 시작/ })).toBeDisabled();
    for (const [index, page] of [guest, mobile].entries()) {
      await page.goto(`/?room=${code}`);
      await page.locator('#nickname').fill(index === 0 ? '바나나친구' : '모바일손님');
      await expect(page.getByLabel('초대 코드 6자리')).toHaveValue(code);
      await page.getByRole('button', { name: /^입장/ }).click();
      await expect(page.locator('.guest-row:not(.empty-guest)')).toHaveCount(index + 2);
    }
    await expect(host.locator('.guest-row:not(.empty-guest)')).toHaveCount(3);
    for (const page of pages)
      await page.getByRole('button', { name: '준비 완료', exact: true }).click();
    await expect(host.getByRole('button', { name: /경매 시작/ })).toBeEnabled();
    await host.getByRole('button', { name: /경매 시작/ }).click();
    await expect(host.locator('.auction-page')).toBeVisible();
    await expect(guest.locator('.auction-page')).toBeVisible();
    await host.getByRole('button', { name: /나만의 비밀 미션/ }).click();
    const mission = await host.locator('.mission-content h3').innerText();
    await host.getByRole('button', { name: /5코인 입찰하기/ }).click();
    await expect(guest.locator('.current-bidder')).toContainText('오리방장');
    await guest.getByRole('button', { name: /10코인 입찰하기/ }).click();
    await expect(host.locator('.current-bidder')).toContainText('바나나친구');
    await host.screenshot({ path: testInfo.outputPath('auction-desktop.png'), fullPage: true });
    await noHorizontalOverflow(mobile);
    await mobile.screenshot({ path: testInfo.outputPath('auction-mobile.png'), fullPage: true });
    await host.reload();
    await expect(host.locator('.auction-page')).toBeVisible();
    await host.getByRole('button', { name: /나만의 비밀 미션/ }).click();
    await expect(host.locator('.mission-content h3')).toHaveText(mission);
    await expect(host.locator('.table-player.is-me')).toContainText('오리방장');
    let collectionMissions = 0;
    for (const page of pages) {
      if (page !== host) await page.getByRole('button', { name: /나만의 비밀 미션/ }).click();
      const title = await page.locator('.mission-content h3').innerText();
      const definition = MISSIONS.find((entry) => entry.title === title);
      expect(definition).toBeDefined();
      if (definition!.targetItem) {
        collectionMissions += 1;
        await expect(page.locator('.mission-content .collection-notice')).toHaveText(
          collectionNotice,
        );
      } else {
        await expect(page.locator('.mission-content .collection-notice')).toHaveCount(0);
      }
    }
    // Three distinct missions and only two general missions guarantee a collection target.
    expect(collectionMissions).toBeGreaterThanOrEqual(1);
    await noHorizontalOverflow(mobile);
    await mobile.screenshot({ path: testInfo.outputPath('mission-mobile.png'), fullPage: true });
    await expect(host.locator('.results-page')).toBeVisible({ timeout: 40000 });
    await expect(host.locator('.result-row')).toHaveCount(3);
    await expect(mobile.locator('.results-page')).toBeVisible();
    await noHorizontalOverflow(mobile);
    await host.screenshot({ path: testInfo.outputPath('results-desktop.png'), fullPage: true });
    await expect(host.locator('.revealed-mission')).toHaveCount(3);
    await host.getByRole('button', { name: /한 판 더/ }).click();
    for (const page of pages) {
      await expect(page.locator('.lobby')).toBeVisible();
      await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeEnabled();
    }
    await expect(host.getByRole('button', { name: /경매 시작/ })).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    for (const page of pages) {
      if (!page.isClosed())
        await page
          .getByRole('button', { name: /^나가기/ })
          .click()
          .catch(() => undefined);
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('solo practice has two bots that actually bid and supports leaving', async ({ page }) => {
  const errors: string[] = [];
  watchErrors(page, errors);
  await page.goto('/');
  await page.locator('#nickname').fill('혼자온손님');
  await page.getByRole('button', { name: /혼자 (연습|체험)/ }).click();
  await expect(page.locator('.guest-row:not(.empty-guest)')).toHaveCount(3);
  await expect(page.locator('.guest-name').filter({ hasText: 'BOT' })).toHaveCount(2);
  await page.getByRole('button', { name: '준비 완료', exact: true }).click();
  await page.getByRole('button', { name: /경매 시작/ }).click();
  await expect(page.locator('.current-bidder')).toContainText('봇');
  await page.getByRole('button', { name: /^나가기/ }).click();
  await expect(page.locator('.landing')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
