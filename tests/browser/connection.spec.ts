import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

const sessionKey = 'oddbid-session';

interface RoutedSocket {
  client: WebSocketRoute;
  server: WebSocketRoute;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function savedSession(page: Page): Promise<string | null> {
  return page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
}

async function createPractice(page: Page, name: string): Promise<string> {
  await page.locator('#nickname').fill(name);
  await page.getByRole('button', { name: /혼자 연습/ }).click();
  await expect(page.locator('.lobby')).toBeVisible();
  await expect(page.locator('.guest-row:not(.empty-guest)')).toHaveCount(3);
  await expect(page.locator('.room-badge')).toHaveText(/^[A-Z0-9]{6}$/);
  return (await page.locator('.room-badge').innerText()).trim();
}

async function expectClearedSession(page: Page): Promise<void> {
  await expect(page.locator('.landing')).toBeVisible();
  await expect(page.locator('.reconnect-banner')).toHaveCount(0);
  await expect(page.locator('.room-badge')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => savedSession(page)).toBeNull();
}

async function closeSocket(socket: RoutedSocket, code: number): Promise<void> {
  // Close both proxy endpoints: the browser observes the close code and the real
  // server observes the disconnected transport, without a production test hook.
  await socket.client.close({ code });
  await socket.server.close({ code });
}

test('an expired saved session clears its invitation and allows a fresh room', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => {
    // Room codes never contain zero, so this token cannot identify a live room.
    sessionStorage.setItem('oddbid-session', '000000:expired-session');
    sessionStorage.setItem('oddbid-name', '복귀손님');
  });
  await page.goto('/?room=000000');
  await expect(page.getByRole('alert')).toContainText(/다시 연결|만료|새로 입장/);
  await expectClearedSession(page);
  await expect(page.locator('#nickname')).toHaveValue('복귀손님');

  const code = await createPractice(page, '복귀손님');
  await expect.poll(() => savedSession(page)).toMatch(new RegExp(`^${code}:`));
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a server shutdown returns to entry and clears the previous game UI', async ({ page }) => {
  const errors = watchErrors(page);
  const sockets: RoutedSocket[] = [];
  await page.routeWebSocket(
    (url) => url.searchParams.has('sessionId'),
    (client) => sockets.push({ client, server: client.connectToServer() }),
  );
  await page.goto('/');
  const oldCode = await createPractice(page, '다시온손님');
  await page.getByRole('button', { name: '준비 완료', exact: true }).click();
  await page.getByRole('button', { name: /경매 시작/ }).click();
  await expect(page.locator('.auction-page')).toBeVisible();
  await page.getByRole('button', { name: /나만의 비밀 미션/ }).click();
  await expect(page.locator('.mission-content')).toBeVisible();
  await page
    .getByRole('button', { name: /반응 보내기/ })
    .first()
    .click();
  await expect(page.locator('.floating-reaction')).toHaveCount(1);

  // Colyseus uses 4001 for SERVER_SHUTDOWN; exercise its real onLeave path.
  await closeSocket(sockets[0]!, 4001);
  await expectClearedSession(page);
  await expect(page.getByRole('alert')).toContainText(/서버|연결|종료/);
  const newCode = await createPractice(page, '다시온손님');
  expect(newCode).not.toBe(oldCode);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '준비 완료', exact: true }).click();
  await page.getByRole('button', { name: /경매 시작/ }).click();
  await expect(page.locator('.auction-page')).toBeVisible();
  await expect(page.locator('.mission-content')).toHaveCount(0);
  await expect(page.locator('.floating-reaction')).toHaveCount(0);
  await expect(page.locator('.table-player.is-me')).toContainText('100코인');
  expect(errors).toEqual([]);
});

test('automatic reconnection saves the renewed token for the next page reload', async ({
  page,
}) => {
  const errors = watchErrors(page);
  const sockets: RoutedSocket[] = [];
  await page.routeWebSocket(
    (url) => url.searchParams.has('sessionId'),
    (client) => sockets.push({ client, server: client.connectToServer() }),
  );
  await page.goto('/');
  const code = await createPractice(page, '재접속손님');
  const token = await savedSession(page);
  expect(token).toBeTruthy();

  // A drop immediately after joining must recover, too.
  await closeSocket(sockets[0]!, 4010);
  await expect.poll(() => sockets.length).toBe(2);
  await expect(page.locator('.reconnect-banner')).toHaveCount(0);
  await expect(page.locator('.room-badge')).toHaveText(code);
  await expect.poll(() => savedSession(page)).not.toBe(token);
  await expect.poll(() => savedSession(page)).toMatch(new RegExp(`^${code}:`));

  await page.reload();
  await expect(page.locator('.lobby')).toBeVisible();
  await expect(page.locator('.room-badge')).toHaveText(code);
  await expect(page.locator('.guest-row:not(.empty-guest)')).toHaveCount(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('leaving during automatic recovery prevents a late socket from restoring the old room', async ({
  page,
}) => {
  const errors = watchErrors(page);
  const sockets: RoutedSocket[] = [];
  const delayedMessages: Array<string | Buffer> = [];
  let delayedSocket: RoutedSocket | undefined;
  let holdRecovery = true;
  let recoveryProcessed = false;
  await page.routeWebSocket(
    (url) => url.searchParams.has('sessionId'),
    (client) => {
      const socket = { client, server: client.connectToServer() };
      sockets.push(socket);
      if (sockets.length === 2) {
        delayedSocket = socket;
        client.onMessage((message) => {
          recoveryProcessed = true;
          socket.server.send(message);
        });
        client.onClose((code, reason) => {
          recoveryProcessed = true;
          void socket.server.close({ code, reason });
        });
        socket.server.onMessage((message) => {
          if (holdRecovery) delayedMessages.push(message);
          else client.send(message);
        });
      }
    },
  );
  await page.goto('/');
  const oldCode = await createPractice(page, '떠나는손님');
  await closeSocket(sockets[0]!, 4010);
  await expect(page.locator('.reconnect-banner')).toBeVisible();
  await expect.poll(() => delayedMessages.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /경매 시작/ })).toBeDisabled();
  await expect(page.locator('.reconnect-banner button')).toBeDisabled();

  await page.getByRole('button', { name: /^나가기/ }).click();
  await expectClearedSession(page);
  const newCode = await createPractice(page, '새로운손님');
  expect(newCode).not.toBe(oldCode);

  // Release the actual old server handshake only after a new room is active.
  // A correctly cancelled connection may already be closed; send is harmless then.
  holdRecovery = false;
  for (const message of delayedMessages) delayedSocket!.client.send(message);
  await expect.poll(() => recoveryProcessed).toBe(true);
  await expect(page.locator('.room-badge')).toHaveText(newCode);
  await expect(page).toHaveURL(new RegExp(`room=${newCode}$`));
  await expect.poll(() => savedSession(page)).toMatch(new RegExp(`^${newCode}:`));
  await expect(page.locator('.guest-row')).toContainText(['새로운손님', '오리봇', '바나나봇']);
  await expect(page.locator('.reconnect-banner')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cancelling an in-flight room creation discards its late response', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let holdFirstRequest = true;
  let responseReady = false;
  let lateRoomClosed = false;
  const sockets: RoutedSocket[] = [];
  await page.route(/\/matchmake\/create\/auction$/, async (route) => {
    if (!holdFirstRequest) return route.continue();
    holdFirstRequest = false;
    const response = await route.fetch();
    responseReady = true;
    await responseGate;
    await route.fulfill({ response });
  });
  await page.routeWebSocket(
    (url) => url.searchParams.has('sessionId'),
    (client) => {
      const socket = { client, server: client.connectToServer() };
      sockets.push(socket);
      if (sockets.length === 2) {
        socket.server.onClose((code, reason) => {
          lateRoomClosed = true;
          void client.close({ code, reason });
        });
      }
    },
  );
  await page.goto('/');
  await page.locator('#nickname').fill('취소할손님');
  await page.getByRole('button', { name: /새 경매장 열기/ }).click();
  await expect.poll(() => responseReady).toBe(true);
  await expect(page.getByRole('button', { name: '연결 취소', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.getByRole('button', { name: '연결 취소', exact: true }).click();
  await expectClearedSession(page);
  await expect(page.getByRole('button', { name: /새 경매장 열기/ })).toBeEnabled();

  const newCode = await createPractice(page, '남아있는손님');
  releaseResponse();
  await expect.poll(() => lateRoomClosed).toBe(true);
  await expect(page.locator('.room-badge')).toHaveText(newCode);
  await expect(page).toHaveURL(new RegExp(`room=${newCode}$`));
  await expect.poll(() => savedSession(page)).toMatch(new RegExp(`^${newCode}:`));
  await expect(page.locator('.guest-row')).toContainText(['남아있는손님', '오리봇', '바나나봇']);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a second drop before state sync keeps the original recovery deadline', async ({ page }) => {
  const errors = watchErrors(page);
  const clockStart = Date.now();
  const sockets: RoutedSocket[] = [];
  let heldMessages = 0;
  await page.clock.install({ time: clockStart });
  await page.routeWebSocket(
    (url) => url.searchParams.has('sessionId'),
    (client) => {
      const socket = { client, server: client.connectToServer() };
      sockets.push(socket);
      const attempt = sockets.length;
      if (attempt > 1) {
        let firstMessage = true;
        socket.server.onMessage((message) => {
          if (attempt === 2 && firstMessage) {
            // Forward the real JOIN handshake, but withhold snapshot/self so the
            // connection has not recovered completely when it drops again.
            firstMessage = false;
            client.send(message);
          } else heldMessages += 1;
        });
      }
    },
  );
  await page.goto('/');
  await createPractice(page, '기다리는손님');
  const previousToken = await savedSession(page);

  // Freeze only browser time after entry. The real server's grace-period clock
  // is unchanged; this test measures the client's original 30-second deadline.
  await page.clock.pauseAt(clockStart + 60_000);
  await closeSocket(sockets[0]!, 4010);
  await page.clock.runFor(300);
  await expect.poll(() => heldMessages).toBeGreaterThan(0);
  await expect.poll(() => savedSession(page)).not.toBe(previousToken);
  await expect(page.locator('.reconnect-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled();

  await page.clock.fastForward(29_000);
  await closeSocket(sockets[1]!, 4010);
  await page.clock.fastForward(1100);
  await expectClearedSession(page);
  await expect(page.getByRole('alert')).toContainText('이전 방에 다시 연결할 수 없어요');
  await expect(page.getByRole('button', { name: /새 경매장 열기/ })).toBeEnabled();
  expect(errors).toEqual([]);
});
