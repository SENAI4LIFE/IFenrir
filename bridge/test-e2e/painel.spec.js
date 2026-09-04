import { expect, test } from '@playwright/test';

import { BASE_ABERTO, BASE_DESCONECTADO, TOKEN_LEITURA, TOKEN_OPERADOR } from './config.mjs';

const URL_DESCONECTADO = BASE_DESCONECTADO;
const URL_ABERTO = BASE_ABERTO;

function coletarProblemas(page) {
  const excecoes = [];
  const consoleErros = [];
  const requisicoesFalhas = [];
  const respostasNaoOk = [];

  page.on('pageerror', (erro) => excecoes.push(erro.message));
  page.on('console', (mensagem) => {
    if (mensagem.type() !== 'error') return;
    const texto = mensagem.text();
    if (/Failed to load resource/i.test(texto)) return;
    consoleErros.push(texto);
  });
  page.on('requestfailed', (requisicao) => {
    requisicoesFalhas.push(`${requisicao.method()} ${requisicao.url()}`);
  });
  page.on('response', (resposta) => {
    if (!resposta.ok()) {
      respostasNaoOk.push(`${resposta.status()} ${resposta.url()}`);
    }
  });

  return { excecoes, consoleErros, requisicoesFalhas, respostasNaoOk };
}

async function autenticar(page, token = TOKEN_OPERADOR) {
  await page.fill('#token', token);
  await page.click('#atualizar');
}

test.describe('painel de demonstracao', () => {
  test('carrega e apresenta a identidade do projeto', async ({ page }) => {
    const problemas = coletarProblemas(page);
    await page.goto('/');

    await expect(page).toHaveTitle('IFenrir');
    await expect(page.locator('h1')).toHaveText('IFenrir');
    await expect(page.locator('.sub')).toContainText('Painel de validação');

    expect(problemas.excecoes).toEqual([]);
    expect(problemas.consoleErros).toEqual([]);
    expect(problemas.requisicoesFalhas).toEqual([]);
    expect(problemas.respostasNaoOk).toEqual([]);
  });

  test('apresenta o dispositivo conectado e o transporte em uso', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#conectado')).toContainText('conectado', { timeout: 10000 });
    await expect(page.locator('#transporte')).toContainText('fake');
    await expect(page.locator('#autenticacao')).toContainText('token');
  });

  test('sem token a lista de capacidades orienta o operador sem requisicao falha', async ({ page }) => {
    const problemas = coletarProblemas(page);
    await page.goto('/');
    await expect(page.locator('#capacidades')).toContainText('Informe o token de acesso', { timeout: 10000 });
    expect(problemas.respostasNaoOk).toEqual([]);
    expect(problemas.excecoes).toEqual([]);
  });

  test('com token de operador lista as capacidades declaradas', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    const itens = page.locator('.cap');
    await expect(itens.first()).toBeVisible({ timeout: 10000 });
    await expect(itens).toHaveCount(12);

    await expect(page.locator('.cap', { hasText: 'obter_estado' }).first()).toContainText('permitida');
    await expect(page.locator('.cap', { hasText: 'definir_rotulo' })).toContainText('permitida');
  });

  test('token somente leitura marca capacidades de escrita como bloqueadas', async ({ page }) => {
    await page.goto('/');
    await autenticar(page, TOKEN_LEITURA);

    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cap', { hasText: 'definir_rotulo' })).toContainText('bloqueada');
    await expect(page.locator('.cap', { hasText: 'obter_estado' }).first()).toContainText('permitida');
  });

  test('executa uma capacidade de leitura e mostra o resultado', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'obter_estado');
    await page.click('#invocar');

    const saida = page.locator('#saida');
    await expect(saida).toContainText('HTTP 200', { timeout: 10000 });
    await expect(saida).toContainText('"sucesso": true');
    await expect(saida).toContainText('memoria_livre_bytes');
  });

  test('mantem a correlacao entre requisicao e resposta', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'obter_tempo_atividade');
    await page.click('#invocar');
    await expect(page.locator('#saida')).toContainText('"sucesso": true', { timeout: 10000 });

    const texto = await page.locator('#saida').textContent();
    const corpo = JSON.parse(texto.slice(texto.indexOf('{')));
    expect(corpo.id).toMatch(/^[0-9a-f-]{8,}$/);
    expect(corpo.protocolo).toBe('ifenrir/1');
  });

  test('exibe erro estruturado quando a capacidade nao e permitida', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'definir_led');
    await page.click('#invocar');

    const saida = page.locator('#saida');
    await expect(saida).toContainText('CAPACIDADE_NAO_PERMITIDA', { timeout: 10000 });
    await expect(saida).toContainText('HTTP 403');
  });

  test('exibe erro de validacao para argumento invalido', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'ecoar');
    await page.fill('#arg_texto', '');
    await page.click('#invocar');

    await expect(page.locator('#saida')).toContainText('ARGUMENTO_INVALIDO', { timeout: 10000 });
  });

  test('recusa escrita quando o escopo do token e insuficiente', async ({ page }) => {
    await page.goto('/');
    await autenticar(page, TOKEN_LEITURA);

    await page.selectOption('#capacidade', 'definir_rotulo');
    await page.fill('#arg_rotulo', 'bancada-teste');
    await page.click('#invocar');

    const saida = page.locator('#saida');
    await expect(saida).toContainText('NAO_AUTORIZADO', { timeout: 10000 });
    await expect(saida).toContainText('HTTP 403');
  });

  test('troca de capacidade ajusta os campos de argumento', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'ecoar');
    await expect(page.locator('#arg_texto')).toBeVisible();

    await page.selectOption('#capacidade', 'obter_estado');
    await expect(page.locator('#arg_texto')).toHaveCount(0);

    await page.selectOption('#capacidade', 'definir_rotulo');
    await expect(page.locator('#arg_rotulo')).toBeVisible();
  });

  test('o botao de execucao volta a ficar disponivel apos a resposta', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);

    await page.selectOption('#capacidade', 'obter_memoria_livre');
    await page.click('#invocar');

    await expect(page.locator('#saida')).toContainText('HTTP', { timeout: 10000 });
    await expect(page.locator('#invocar')).toBeEnabled();
  });

  test('permite operar pelo teclado', async ({ page }) => {
    await page.goto('/');

    await page.locator('#token').focus();
    await page.keyboard.type(TOKEN_OPERADOR);
    await page.locator('#atualizar').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

    await page.locator('#capacidade').selectOption('obter_estado');
    await page.locator('#invocar').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#saida')).toContainText('"sucesso": true', { timeout: 10000 });
  });

  test('recarregar a pagina restabelece o estado inicial', async ({ page }) => {
    await page.goto('/');
    await autenticar(page);
    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

    await page.reload();

    await expect(page.locator('#token')).toHaveValue('');
    await expect(page.locator('#saida')).toContainText('Nenhuma execução ainda');
    await expect(page.locator('#conectado')).toContainText('conectado', { timeout: 10000 });
  });

  test('nao possui links quebrados nem recursos externos', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('a[href]').evaluateAll((elementos) => elementos.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual([]);

    const externos = await page
      .locator('script[src], link[href], img[src]')
      .evaluateAll((elementos) => elementos.map((e) => e.getAttribute('src') ?? e.getAttribute('href')));
    expect(externos.filter((valor) => valor && /^https?:/i.test(valor))).toEqual([]);
  });
});

test.describe('estados de indisponibilidade', () => {
  test('sinaliza o dispositivo desconectado', async ({ page }) => {
    await page.goto(`${URL_DESCONECTADO}/`);
    await expect(page.locator('#conectado')).toContainText('desconectado', { timeout: 10000 });
  });

  test('invocacao com dispositivo ausente retorna erro estruturado', async ({ page }) => {
    await page.goto(`${URL_DESCONECTADO}/`);
    await page.fill('#token', TOKEN_OPERADOR);
    await page.click('#atualizar');
    await expect(page.locator('.cap').first()).toBeVisible({ timeout: 10000 });

    await page.selectOption('#capacidade', 'obter_estado');
    await page.click('#invocar');

    const saida = page.locator('#saida');
    await expect(saida).toContainText('DISPOSITIVO_DESCONECTADO', { timeout: 10000 });
    await expect(saida).toContainText('HTTP 503');
  });

  test('ponte inacessivel e reportada sem erro nao tratado', async ({ page }) => {
    const problemas = coletarProblemas(page);
    await page.goto('/');
    await page.route('**/api/saude', (rota) => rota.abort());
    await page.click('#atualizar');

    await expect(page.locator('#conectado')).toContainText('ponte inacessível', { timeout: 10000 });
    expect(problemas.excecoes).toEqual([]);
    expect(problemas.consoleErros).toEqual([]);
  });
});

test.describe('modo aberto sem autenticacao', () => {
  test('lista capacidades sem token quando a ponte esta aberta', async ({ page }) => {
    await page.goto(`${URL_ABERTO}/`);
    await expect(page.locator('#autenticacao')).toContainText('aberta', { timeout: 10000 });
    await expect(page.locator('.cap')).toHaveCount(12, { timeout: 10000 });
  });
});
