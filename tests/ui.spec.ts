import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ request }) => {
  const headers = { 'X-Trama-Request': '1' };
  const response = await request.get('/api/projects', { headers });
  const projects = await response.json();
  for (const project of projects) await request.delete('/api/projects/' + project.id, { headers });
});

async function openOrders(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con un ejemplo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visión general' })).toBeVisible();
}

test('a learner traces a process, saves reasoning, searches evidence and records a practice attempt', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openOrders(page);
  const snapshotId = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  await page
    .getByRole('main')
    .getByRole('button', { name: /Solicitudes a \/pedidos/ })
    .click();
  await expect(page.getByLabel('Tu predicción')).toBeVisible();
  await page
    .getByLabel('Tu predicción')
    .fill('Espero que la ruta valide las unidades y devuelva el pedido creado.');
  await page.getByRole('button', { name: 'Contrastar con el código', exact: true }).click();
  await page.getByRole('button', { name: 'Me faltó una conexión', exact: true }).click();
  await page
    .getByLabel('Qué falta por resolver')
    .fill('Tengo que localizar el límite máximo de unidades.');
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/snapshots/' + snapshotId, {
        headers: { 'X-Trama-Request': '1' },
      });
      const stored = await response.json();
      return JSON.stringify(stored.learning);
    })
    .toContain('Tengo que localizar el límite');
  await page.reload();
  await expect(page.getByLabel('Qué falta por resolver')).toHaveValue(
    'Tengo que localizar el límite máximo de unidades.',
  );
  await page.getByRole('button', { name: 'Abrir archivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leer la fuente' })).toBeVisible();
  await expect(page.locator('.code-line.selected')).toContainText('app.post("/pedidos"');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir archivo', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Conexiones de código', exact: true }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByLabel('Filtrar mapa').fill('routes.js');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await page.getByRole('button', { name: 'Leer código', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leer la fuente' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await page.getByRole('button', { name: 'Código y fuentes', exact: true }).click();
  await page.getByLabel('Buscar en el repositorio').fill('ROLLBACK');
  await page.getByRole('button', { name: 'Buscar en el contenido', exact: true }).click();
  await expect(page.locator('.file-list button')).toHaveCount(2);
  await page.locator('.file-list button').first().click();
  await expect(page.locator('.code-line.selected')).toContainText('ROLLBACK');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Predice la respuesta', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('La creación devuelve 201', { exact: false })).toHaveCount(0);
  await page
    .getByLabel('Tu razonamiento')
    .fill('Espero 201 y 750 centavos porque son tres unidades de 250.');
  await page.getByRole('button', { name: 'Contrastar mi respuesta', exact: true }).click();
  await expect(page.getByText('La creación devuelve 201', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Tu razonamiento')).not.toBeEditable();
  await page.getByRole('button', { name: 'La pude justificar', exact: true }).click();
  await expect(page.getByText('Autoevaluación guardada para el próximo repaso.')).toBeVisible();

  await page.getByRole('button', { name: 'Mi cuaderno', exact: true }).click();
  await page
    .getByLabel('Mi explicación del sistema')
    .fill('El pedido se guarda junto a su evento y el worker aplica el movimiento después.');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar cuaderno y fuentes', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bundle = JSON.parse(await readFile(path!, 'utf8'));
  expect(JSON.stringify(bundle)).toContain('El pedido se guarda junto a su evento');
  expect(JSON.stringify(bundle)).toContain('Espero 201 y 750 centavos');
  expect(errors).toEqual([]);
});

test('small screens can open the project navigation and a source', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOrders(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Proyecto', exact: true }).click();
  await page.getByRole('button', { name: 'Código y fuentes', exact: true }).click();
  await page.getByLabel('Buscar en el repositorio').fill('crear-pedido.js');
  await page.locator('.file-list button').click();
  await expect(page.getByRole('heading', { name: 'Leer la fuente' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('a late tutor response cannot overwrite another project notebook', async ({ page }) => {
  await page.route('**/api/provider', (route) =>
    route.fulfill({
      json: {
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'fixture',
        configured: true,
        hasKey: false,
        isLocal: true,
      },
    }),
  );
  let finish: (() => void) | undefined;
  await page.route('**/api/snapshots/*/ask', async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route
      .fulfill({
        json: {
          answer: {
            summary: 'Fixture response',
            claims: [{ text: 'Fixture claim', status: 'unknown', sources: [] }],
            nextQuestion: 'Next?',
          },
          context: { files: [], bytes: 0, rejectedReferences: 0 },
          model: 'fixture',
          verification: 'references-only',
        },
      })
      .catch(() => undefined);
  });
  await openOrders(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: /Solicitudes a \/pedidos/ })
    .click();
  await page.getByRole('button', { name: 'Contrastar con el código', exact: true }).click();
  await page.getByRole('button', { name: 'Profundizar con mi modelo', exact: true }).click();
  await page.getByRole('button', { name: 'Explicar con mi modelo', exact: true }).click();
  await expect.poll(() => !!finish).toBe(true);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('.project-actions > summary').click();
  await page.getByRole('button', { name: 'Abrir otro proyecto', exact: true }).click();
  await page.getByRole('button', { name: 'Del CSV al informe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visión general' })).toBeVisible();
  await page.getByRole('button', { name: 'Mi cuaderno', exact: true }).click();
  const note = page.getByLabel('Mi explicación del sistema');
  await note.fill('Este pipeline conserva mi explicación independiente.');
  const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/snapshots/' + id, {
        headers: { 'X-Trama-Request': '1' },
      });
      return (await r.json()).learning.notes;
    })
    .toBe('Este pipeline conserva mi explicación independiente.');
  finish!();
  await expect(note).toHaveValue('Este pipeline conserva mi explicación independiente.');
  await page.reload();
  await expect(page.getByLabel('Mi explicación del sistema')).toHaveValue(
    'Este pipeline conserva mi explicación independiente.',
  );
  const r = await page.request.get('/api/snapshots/' + id, { headers: { 'X-Trama-Request': '1' } });
  expect((await r.json()).learning.sessions || []).toHaveLength(0);
});

test('a failed save survives reload and can be exported before retrying', async ({ page }) => {
  await openOrders(page);
  await page.getByRole('button', { name: 'Mi cuaderno', exact: true }).click();
  const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/snapshots/' + id, {
        headers: { 'X-Trama-Request': '1' },
      });
      return (await response.json()).learning.position?.view;
    })
    .toBe('notebook');
  await page.route('**/api/snapshots/*/learning', (route) =>
    route.fulfill({ status: 503, json: { error: 'Fallo temporal de escritura simulado.' } }),
  );
  const text = 'Esta explicación debe conservarse aunque falle el guardado.';
  await page.getByLabel('Mi explicación del sistema').fill(text);
  await expect(page.getByRole('alert')).toContainText('Fallo temporal de escritura simulado.');
  await expect(page.locator('.outline-status')).toContainText('Borrador pendiente de guardar');
  await page.reload();
  await expect(page.getByLabel('Mi explicación del sistema')).toHaveValue(text);
  await expect(page.locator('.outline-status')).toContainText('Borrador pendiente de guardar');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar cuaderno y fuentes', exact: true }).click();
  const saved = await downloadEvent;
  const bundle = JSON.parse(await readFile((await saved.path())!, 'utf8'));
  expect(bundle.snapshot.learning.notes).toBe(text);
  await page.unroute('**/api/snapshots/*/learning');
  await page.getByLabel('Mi explicación del sistema').fill(text + ' Ya puedo continuar.');
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/snapshots/' + id, {
        headers: { 'X-Trama-Request': '1' },
      });
      return (await response.json()).learning.notes;
    })
    .toBe(text + ' Ya puedo continuar.');
  await expect(page.locator('.outline-status')).toContainText('Cuaderno guardado localmente');
});

test('the command palette searches files and supports keyboard actions', async ({ page }) => {
  await openOrders(page);
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Buscar acciones y archivos' });
  await expect(palette).toBeVisible();
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();
  await expect(palette.getByRole('option')).toHaveCount(8);
  await input.fill('CREAR-PEDIDO.JS');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Leer la fuente' })).toBeVisible();
  await expect(page.locator('.source-head strong')).toHaveText('src/crear-pedido.js');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette).toBeVisible();
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(palette.getByRole('option', { selected: true })).toContainText(
    'Configurar mi modelo',
  );
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Ajustes de Trama' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Ajustes de Trama' })).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await input.fill('archivo-inexistente-739105');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await expect(palette.getByText('No hay coincidencias.', { exact: false })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(palette).toBeVisible();
  await input.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('the desktop folder action uses the native picker result', async ({ page }) => {
  const folder = new URL('../examples/pedidos', import.meta.url).pathname;
  await page.addInitScript((selectedFolder) => {
    window.tramaDesktop = {
      platform: 'darwin',
      selectFolder: async () => selectedFolder,
      openExternal: async () => undefined,
      onOpenFolder: () => () => undefined,
      onNavigate: () => () => undefined,
    };
  }, decodeURIComponent(folder));
  await page.goto('/');
  const opening = page.waitForRequest((request) => request.url().endsWith('/api/import'));
  await page.getByRole('main').getByRole('button', { name: 'Abrir carpeta', exact: true }).click();
  const imported = await opening;
  expect(imported.postDataJSON()).toMatchObject({
    kind: 'local',
    path: decodeURIComponent(folder),
  });
  await expect(page.getByRole('heading', { name: 'Visión general' })).toBeVisible();
  const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  const result = await page.request.get('/api/snapshots/' + id, {
    headers: { 'X-Trama-Request': '1' },
  });
  const snapshot = await result.json();
  expect(snapshot.source).toBe('local');
  expect(snapshot.files.some((file: { path: string }) => file.path === 'src/crear-pedido.js')).toBe(
    true,
  );
});

test('practice records source assistance opened through the command palette', async ({ page }) => {
  await openOrders(page);
  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Predice la respuesta', exact: true }),
  ).toBeVisible();
  const prediction = 'Mi predicción antes de consultar la implementación.';
  await page.getByLabel('Tu razonamiento').fill(prediction);
  await expect(page.locator('.exercise .lesson-meta')).toContainText('Sin ayudas abiertas');
  await page.keyboard.press('ControlOrMeta+k');
  const search = page
    .getByRole('dialog', { name: 'Buscar acciones y archivos' })
    .getByRole('combobox');
  await search.fill('crear-pedido.js');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Leer la fuente' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('.exercise .lesson-meta')).not.toContainText('Sin ayudas abiertas');
  await expect(page.getByLabel('Tu razonamiento')).toHaveValue(prediction);
  await page.getByRole('button', { name: 'Contrastar mi respuesta', exact: true }).click();
  await page.getByRole('button', { name: 'Me faltó una parte', exact: true }).click();
  const id = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/snapshots/' + id, {
        headers: { 'X-Trama-Request': '1' },
      });
      return (await response.json()).learning.attempts?.at(-1);
    })
    .toMatchObject({ answer: prediction, assisted: true, review: 'partial' });
});

test('ChatGPT settings open the official browser flow, confirm plan use and keep tokens outside the UI', async ({
  page,
}) => {
  const disconnected = {
    available: true,
    connected: false,
    sharing: false,
    model: '',
    models: [],
    phase: 'idle',
    welcomeSeen: false,
    usageUrl: 'https://chatgpt.com/settings/usage',
  };
  const connected = {
    ...disconnected,
    connected: true,
    sharing: true,
    profileId: 'synthetic-profile',
    email: 'learner@example.test',
    model: 'example-model',
    models: [{ slug: 'example-model', displayName: 'Example model' }],
    phase: 'connected',
  };
  let current: Record<string, unknown> = {
    ...disconnected,
    available: false,
    phase: 'error',
    storage: 'unavailable',
    errorCode: 'chatgpt_storage_unavailable',
    error: 'Almacén temporalmente no disponible.',
  };
  await page.addInitScript(() => {
    (window as any).__tramaOpened = [];
    window.tramaDesktop = {
      platform: 'darwin',
      selectFolder: async () => null,
      onOpenFolder: () => () => {},
      onNavigate: () => () => {},
      openExternal: async (url: string) => {
        (window as any).__tramaOpened.push(url);
      },
    };
  });
  await page.route('**/api/chatgpt/status', (route) => route.fulfill({ json: current }));
  await page.route('**/api/chatgpt/connect', async (route) => {
    current = connected;
    await route.fulfill({
      status: 202,
      json: {
        ...disconnected,
        phase: 'connecting',
        authUrl: 'https://auth.openai.com/api/accounts/authorize?state=synthetic-fixture',
      },
    });
  });
  await page.route('**/api/chatgpt/welcome', async (route) => {
    current = { ...connected, welcomeSeen: true };
    await route.fulfill({ json: current });
  });
  await page.route('**/api/chatgpt/disconnect', async (route) => {
    current = { ...disconnected, welcomeSeen: true };
    await route.fulfill({ json: current });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurar modelo', exact: true }).click();
  await expect(
    page.getByText('No pudimos abrir el llavero de macOS.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue with ChatGPT', exact: false }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__tramaOpened))
    .toEqual(['https://auth.openai.com/api/accounts/authorize?state=synthetic-fixture']);
  await expect(
    page.getByRole('heading', { name: 'Estás usando tu plan de ChatGPT', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Entendido', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Estás usando tu plan de ChatGPT', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('learner@example.test', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Modelo disponible para esta cuenta')).toHaveValue('example-model');
  await expect(page.locator('body')).not.toContainText('access_token');
  await page.getByRole('button', { name: 'Gestionar uso', exact: false }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__tramaOpened))
    .toContain('https://chatgpt.com/settings/usage');
  await page.getByRole('button', { name: 'Desconectar de Trama', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue with ChatGPT', exact: false }),
  ).toBeVisible();
});

test('a ChatGPT usage limit does not silently bill the configured API provider', async ({
  page,
}) => {
  await page.route('**/api/chatgpt/status', (route) =>
    route.fulfill({
      json: {
        available: true,
        connected: true,
        sharing: true,
        profileId: 'synthetic-profile',
        email: 'learner@example.test',
        model: 'example-model',
        models: [{ slug: 'example-model', displayName: 'Example model' }],
        phase: 'connected',
        welcomeSeen: true,
        usageUrl: 'https://chatgpt.com/settings/usage',
      },
    }),
  );
  await page.route('**/api/provider', (route) =>
    route.fulfill({
      json: {
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'other-model',
        configured: true,
        hasKey: false,
        isLocal: true,
      },
    }),
  );
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/snapshots/*/ask', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      status: 429,
      json: {
        error: 'Se alcanzó un límite de uso de ChatGPT.',
        code: 'subscription_sharing_usage_limit_exceeded',
      },
    });
  });
  await openOrders(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: /Solicitudes a \/pedidos/ })
    .click();
  await page.getByRole('button', { name: 'Contrastar con el código', exact: true }).click();
  await page.getByRole('button', { name: 'Profundizar con mi modelo', exact: true }).click();
  const explain = page.getByRole('button', { name: 'Explicar con mi modelo', exact: true });
  await expect(explain).toBeDisabled();
  await page.getByRole('checkbox', { name: /Enviar la pregunta y los fragmentos/ }).check();
  await explain.click();
  await expect(page.getByRole('alert')).toContainText('Se alcanzó un límite');
  await expect(page.getByLabel('Usar para esta consulta')).toHaveValue('chatgpt');
  await expect(page.locator('.error .button.primary')).toContainText('Gestionar uso');
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    provider: 'chatgpt',
    allowRemote: true,
    expectedProfileId: 'synthetic-profile',
    model: 'example-model',
  });
  expect(submitted[0]).not.toHaveProperty('expectedEndpoint');
});

test('repository navigation preserves reading when its outline is hidden and keeps actions contextual', async ({
  page,
}) => {
  await openOrders(page);
  const outline = page.getByRole('complementary', { name: 'Índice del repositorio' });
  await outline.getByRole('button', { name: 'Solicitudes a /pedidos', exact: true }).click();
  await page.getByLabel('Tu predicción').fill('La solicitud deja un evento pendiente.');
  await page.getByRole('button', { name: 'Ocultar índice', exact: true }).click();
  await expect(outline).not.toBeVisible();
  await expect(page.getByLabel('Tu predicción')).toHaveValue(
    'La solicitud deja un evento pendiente.',
  );
  await page.getByRole('button', { name: 'Mostrar índice', exact: true }).click();
  await expect(outline).toBeVisible();
  await expect(page.locator('.outline-feature.selected')).toHaveText('Solicitudes a /pedidos');
  await page.locator('.project-actions > summary').click();
  await page.getByRole('button', { name: 'Revisiones', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisiones del proyecto' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Trama, inicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
});

test('a 4000-file capture stays bounded and exposes late files, directed neighbors and a keyboard list', async ({
  page,
}) => {
  await openOrders(page);
  const snapshotId = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  const original = await (
    await page.request.get('/api/snapshots/' + snapshotId, { headers: { 'X-Trama-Request': '1' } })
  ).json();
  const nodes = Array.from({ length: 4000 }, (_, i) => {
    const path = `packages/area-${Math.floor(i / 100)}/feature-${String(i).padStart(4, '0')}.ts`;
    return {
      id: path,
      path,
      label: path.split('/').at(-1),
      kind: 'module',
      symbols: [`operation${i}`],
    };
  });
  const edges = [
    {
      id: 'late-dependency',
      source: nodes[3999].id,
      target: nodes[12].id,
      kind: 'import',
      line: 1,
    },
    {
      id: 'late-dependent',
      source: nodes[3998].id,
      target: nodes[3999].id,
      kind: 'import',
      line: 1,
    },
    { id: 'second-hop', source: nodes[12].id, target: nodes[11].id, kind: 'import', line: 1 },
  ];
  await page.route('**/api/snapshots/' + snapshotId, (route) =>
    route.fulfill({
      json: {
        ...original,
        graph: { nodes, edges },
        coverage: { ...original.coverage, indexed: 4000 },
      },
    }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Conexiones de código', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conexiones del repositorio' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByLabel('Filtrar mapa').fill('feature-3999');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await page.getByRole('button', { name: 'Ver conexiones', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByLabel('Dirección de las conexiones').selectOption('dependencies');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByLabel('Distancia de las conexiones').selectOption('2');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(page.getByRole('button', { name: /feature-0011.ts.*operation11/ })).toBeVisible();
  await page.getByRole('button', { name: 'Repositorio', exact: true }).click();
  await page.getByRole('button', { name: /packages.*4000 archivos agrupados/ }).click();
  await page.getByRole('button', { name: 'Abrir carpeta', exact: true }).click();
  await expect(page.locator('.connections-list > button')).toHaveCount(16);
  await expect(page.getByText('Página 1 de 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente del mapa', exact: true }).click();
  await expect(page.locator('.connections-list > button')).toHaveCount(16);
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente del mapa', exact: true }).click();
  await expect(page.locator('.connections-list > button')).toHaveCount(8);
  await expect(page.getByText('Página 3 de 3', { exact: true })).toBeVisible();
});

test('overview guides the next action and a process opens its source scope in the map', async ({
  page,
}) => {
  await openOrders(page);
  await expect(page.getByRole('heading', { name: 'Empieza por un comportamiento' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar el recorrido', exact: true }).click();
  await expect(page.getByLabel('Tu predicción')).toBeVisible();
  await page.getByRole('button', { name: 'Ver conexiones de este proceso', exact: true }).click();
  await expect(page.getByLabel('Ámbito de conexiones')).toHaveValue('initial');
  await expect(page.getByRole('heading', { name: 'Conexiones del repositorio' })).toBeVisible();
});
