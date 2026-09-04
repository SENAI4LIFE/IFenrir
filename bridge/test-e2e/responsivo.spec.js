import { devices, expect, test } from '@playwright/test';

import { BASE_CONECTADO, TOKEN_OPERADOR } from './config.mjs';

const TAMANHOS = [
  { nome: 'celular pequeno', width: 320, height: 568 },
  { nome: 'celular padrao', width: 390, height: 844 },
  { nome: 'tablet', width: 768, height: 1024 },
  { nome: 'notebook', width: 1366, height: 768 },
  { nome: 'desktop amplo', width: 1920, height: 1080 },
];

const SELETORES_TEXTO = ['h1', '.sub', 'h2', '.linha span', 'label', 'button'];

async function medirTransbordo(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

for (const tamanho of TAMANHOS) {
  test.describe(`layout ${tamanho.nome} (${tamanho.width}x${tamanho.height})`, () => {
    test.use({ viewport: { width: tamanho.width, height: tamanho.height } });

    test('nao apresenta rolagem horizontal', async ({ page }) => {
      await page.goto('/');
      await page.fill('#token', TOKEN_OPERADOR);
      await page.click('#atualizar');
      await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

      const medida = await medirTransbordo(page);
      expect(medida.scrollWidth).toBeLessThanOrEqual(medida.clientWidth + 1);
    });

    test('nao corta texto dos elementos principais', async ({ page }) => {
      await page.goto('/');
      await page.fill('#token', TOKEN_OPERADOR);
      await page.click('#atualizar');
      await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

      const cortados = await page.evaluate((seletores) => {
        const problemas = [];
        for (const seletor of seletores) {
          for (const elemento of document.querySelectorAll(seletor)) {
            const estilo = getComputedStyle(elemento);
            if (estilo.overflowX === 'auto' || estilo.overflowX === 'scroll') continue;
            if (elemento.scrollWidth > elemento.clientWidth + 1) {
              problemas.push(`${seletor}: ${(elemento.textContent || '').trim().slice(0, 40)}`);
            }
          }
        }
        return problemas;
      }, SELETORES_TEXTO);

      expect(cortados).toEqual([]);
    });

    test('mantem os controles acessiveis e dentro da viewport', async ({ page }) => {
      await page.goto('/');
      await page.fill('#token', TOKEN_OPERADOR);
      await page.click('#atualizar');
      await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

      for (const seletor of ['#token', '#atualizar', '#capacidade', '#invocar']) {
        const controle = page.locator(seletor);
        await expect(controle).toBeVisible();
        const caixa = await controle.boundingBox();
        expect(caixa).not.toBeNull();
        expect(caixa.x).toBeGreaterThanOrEqual(-1);
        expect(caixa.x + caixa.width).toBeLessThanOrEqual(tamanho.width + 1);
        expect(caixa.height).toBeGreaterThanOrEqual(32);
      }
    });

    test('os cartoes nao se sobrepoem', async ({ page }) => {
      await page.goto('/');
      await page.fill('#token', TOKEN_OPERADOR);
      await page.click('#atualizar');
      await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

      const caixas = await page.locator('section').evaluateAll((secoes) =>
        secoes.map((secao) => {
          const r = secao.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        }),
      );

      for (let i = 1; i < caixas.length; i++) {
        expect(caixas[i].top).toBeGreaterThanOrEqual(caixas[i - 1].bottom - 1);
      }
    });

    test('o fluxo de execucao permanece utilizavel', async ({ page }) => {
      await page.goto('/');
      await page.fill('#token', TOKEN_OPERADOR);
      await page.click('#atualizar');
      await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

      await page.selectOption('#capacidade', 'obter_estado');
      await page.click('#invocar');
      await expect(page.locator('#saida')).toContainText('"sucesso": true', { timeout: 10000 });

      const medida = await medirTransbordo(page);
      expect(medida.scrollWidth).toBeLessThanOrEqual(medida.clientWidth + 1);
    });
  });
}

test.describe('perfis de dispositivo do Playwright', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'perfis moveis exigem isMobile, nao suportado no Firefox');

  test('Pixel 7 executa o fluxo de demonstracao', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'perfil Android e validado no Chromium');

    const contexto = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE_CONECTADO });
    const page = await contexto.newPage();

    await page.goto('/');
    await page.fill('#token', TOKEN_OPERADOR);
    await page.tap('#atualizar');
    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

    await page.selectOption('#capacidade', 'obter_estado');
    await page.tap('#invocar');
    await expect(page.locator('#saida')).toContainText('"sucesso": true', { timeout: 10000 });

    const medida = await medirTransbordo(page);
    expect(medida.scrollWidth).toBeLessThanOrEqual(medida.clientWidth + 1);

    await contexto.close();
  });

  test('iPhone 13 executa o fluxo de demonstracao', async ({ browser, browserName }) => {
    test.skip(browserName === 'chromium', 'perfil iOS e validado no WebKit');

    const contexto = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE_CONECTADO });
    const page = await contexto.newPage();

    await page.goto('/');
    await page.fill('#token', TOKEN_OPERADOR);
    await page.tap('#atualizar');
    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

    await page.selectOption('#capacidade', 'obter_estado');
    await page.tap('#invocar');
    await expect(page.locator('#saida')).toContainText('"sucesso": true', { timeout: 10000 });

    await contexto.close();
  });
});
