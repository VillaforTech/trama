import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
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
    await expect(page.getByRole('heading', { name: 'Entiende cómo encaja todo.' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Entiende cómo encaja todo.' })).toBeVisible();
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
