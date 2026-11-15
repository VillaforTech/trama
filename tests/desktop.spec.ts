import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('macOS app embeds its engine, isolates the renderer and indexes its bundled example', async () => {
  test.skip(process.platform !== 'darwin', 'This verifies the macOS distribution.');
  const data = await mkdtemp(path.join(os.tmpdir(), 'trama-desktop-test-'));
  const application = await electron.launch({
    ...(process.env.TRAMA_ELECTRON_EXECUTABLE
      ? { executablePath: process.env.TRAMA_ELECTRON_EXECUTABLE, args: [] }
      : { args: [path.join(process.cwd(), 'desktop', 'main.cjs')] }),
    env: { ...process.env, TRAMA_USER_DATA_DIR: data },
  });
  try {
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: 'Probar con un ejemplo' })).toBeVisible();
    const platform = await page.evaluate(() => ({
      bridge: window.tramaDesktop?.platform,
      node: typeof (window as Window & { require?: unknown }).require,
      selectFolder: typeof window.tramaDesktop?.selectFolder,
    }));
    expect(platform).toEqual({ bridge: 'darwin', node: 'undefined', selectFolder: 'function' });
    const chatgpt = await page.evaluate(
      async () =>
        await (await fetch('/api/chatgpt/status', { headers: { 'X-Trama-Request': '1' } })).json(),
    );
    expect(chatgpt).toMatchObject({ available: true, connected: false, storage: 'encrypted' });
    const authPath = path.join(data, 'data', 'chatgpt-auth.json');
    const savedAuth = JSON.parse(await readFile(authPath, 'utf8'));
    expect(savedAuth).toMatchObject({
      format: 'trama-chatgpt-keychain-v1',
      data: expect.any(String),
    });
    expect(savedAuth).not.toHaveProperty('hostId');
    expect((await stat(authPath)).mode & 0o777).toBe(0o600);
    // Replace only the browser launcher in the main test process. No login occurs.
    await application.evaluate(({ shell }) => {
      (globalThis as typeof globalThis & { openedUrls: string[] }).openedUrls = [];
      shell.openExternal = async (url: string) => {
        (globalThis as typeof globalThis & { openedUrls: string[] }).openedUrls.push(url);
      };
    });
    const external = await page.evaluate(async () => {
      const denied: boolean[] = [];
      for (const url of [
        'javascript:alert(1)',
        'file:///tmp/file',
        'https://evil.test',
        'https://auth.openai.com.evil.test/api/accounts/authorize',
        'https://auth.openai.com@evil.test/api/accounts/authorize',
        'https://auth.openai.com:8443/api/accounts/authorize',
        'https://chatgpt.com/other',
      ]) {
        try {
          await window.tramaDesktop!.openExternal(url);
          denied.push(false);
        } catch {
          denied.push(true);
        }
      }
      await window.tramaDesktop!.openExternal(
        'https://auth.openai.com/api/accounts/authorize?client_id=fixture',
      );
      await window.tramaDesktop!.openExternal('https://chatgpt.com/settings/usage');
      return denied;
    });
    expect(external.every(Boolean)).toBe(true);
    expect(
      await application.evaluate(
        () => (globalThis as typeof globalThis & { openedUrls: string[] }).openedUrls,
      ),
    ).toEqual([
      'https://auth.openai.com/api/accounts/authorize?client_id=fixture',
      'https://chatgpt.com/settings/usage',
    ]);
    const protections = await application.evaluate(({ Menu }) => {
      const appMenu = Menu.getApplicationMenu();
      return {
        hasOpenShortcut: appMenu?.items.some((item) =>
          item.submenu?.items.some((child) => child.accelerator === 'CmdOrCtrl+O'),
        ),
      };
    });
    expect(protections).toMatchObject({ hasOpenShortcut: true });
    const response = await page.request.get(new URL('/api/projects', page.url()).href, {
      headers: { 'X-Trama-Request': '1' },
    });
    expect(response.status()).toBe(403);
    await page.getByRole('button', { name: 'Probar con un ejemplo' }).click();
    await expect(page.getByRole('heading', { name: 'Visión general' })).toBeVisible();
    const projects = await page.evaluate(
      async () =>
        await (await fetch('/api/projects', { headers: { 'X-Trama-Request': '1' } })).json(),
    );
    expect(projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Pedidos' })]),
    );
    await expect(page.getByText(/IndexedDB|Error:|SQLITE_ERROR/)).toHaveCount(0);
    const selectedFolder = path.join(process.cwd(), 'examples', 'data-pipeline');
    await application.evaluate(async ({ dialog, Menu }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
      const item = Menu.getApplicationMenu()!
        .items.flatMap((menu) => menu.submenu?.items || [])
        .find((item) => item.accelerator === 'CmdOrCtrl+O')!;
      await (item.click as () => Promise<void>)();
    }, selectedFolder);
    await expect(page.getByRole('heading', { name: 'Visión general' })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          async () =>
            await (await fetch('/api/projects', { headers: { 'X-Trama-Request': '1' } })).json(),
        ),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'local', location: selectedFolder }),
        ]),
      );
  } finally {
    await application.close();
    await rm(data, { recursive: true, force: true });
  }
});
