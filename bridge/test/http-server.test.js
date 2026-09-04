import assert from 'node:assert/strict';
import test from 'node:test';

import { DeviceSession } from '../src/device-session.js';
import { createHttpServer } from '../src/http-server.js';
import { FakeDeviceTransport, silentLogger } from './fake-device.js';

const TOKEN_OPERADOR = 'token-operador-de-teste';
const TOKEN_LEITURA = 'token-somente-leitura-teste';

async function subirPonte(env = {}) {
  const transport = new FakeDeviceTransport();
  const session = new DeviceSession(transport, silentLogger());
  await session.open();

  const server = createHttpServer({ session, logger: silentLogger(), env });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    session,
    server,
    base: `http://127.0.0.1:${port}`,
    async fechar() {
      await session.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('serve o painel em portugues na raiz', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/`);
  const corpo = await resposta.text();
  assert.equal(resposta.status, 200);
  assert.match(corpo, /IFenrir/);
  assert.match(corpo, /Invocar capacidade/);
  await ponte.fechar();
});

test('expoe saude sem exigir credencial', async () => {
  const ponte = await subirPonte({ IFENRIR_API_TOKEN: TOKEN_OPERADOR });
  const resposta = await fetch(`${ponte.base}/api/saude`);
  const dados = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(dados.dispositivo.conectado, true);
  assert.equal(dados.autenticacao, 'token');
  await ponte.fechar();
});

test('recusa acesso sem token quando a autenticacao esta ativa', async () => {
  const ponte = await subirPonte({ IFENRIR_API_TOKEN: TOKEN_OPERADOR });
  const resposta = await fetch(`${ponte.base}/api/capacidades`);
  const dados = await resposta.json();
  assert.equal(resposta.status, 401);
  assert.equal(dados.erro.codigo, 'NAO_AUTENTICADO');
  await ponte.fechar();
});

test('recusa token invalido', async () => {
  const ponte = await subirPonte({ IFENRIR_API_TOKEN: TOKEN_OPERADOR });
  const resposta = await fetch(`${ponte.base}/api/capacidades`, {
    headers: { authorization: 'Bearer token-errado-mesmo-tamanho' },
  });
  assert.equal(resposta.status, 401);
  await ponte.fechar();
});

test('lista capacidades permitidas conforme o escopo do token', async () => {
  const ponte = await subirPonte({
    IFENRIR_API_TOKEN: TOKEN_OPERADOR,
    IFENRIR_API_TOKEN_LEITURA: TOKEN_LEITURA,
  });

  const leitura = await fetch(`${ponte.base}/api/capacidades`, {
    headers: { authorization: `Bearer ${TOKEN_LEITURA}` },
  });
  const dadosLeitura = await leitura.json();
  assert.deepEqual(dadosLeitura.escopos, ['leitura']);
  assert.ok(!dadosLeitura.permitidas.includes('definir_rotulo'));

  const operador = await fetch(`${ponte.base}/api/capacidades`, {
    headers: { authorization: `Bearer ${TOKEN_OPERADOR}` },
  });
  const dadosOperador = await operador.json();
  assert.ok(dadosOperador.permitidas.includes('definir_rotulo'));

  await ponte.fechar();
});

test('bloqueia capacidade de escrita para token somente leitura', async () => {
  const ponte = await subirPonte({
    IFENRIR_API_TOKEN: TOKEN_OPERADOR,
    IFENRIR_API_TOKEN_LEITURA: TOKEN_LEITURA,
  });

  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN_LEITURA}`, 'content-type': 'application/json' },
    body: JSON.stringify({ capacidade: 'definir_rotulo', argumentos: { rotulo: 'x' } }),
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, 403);
  assert.equal(dados.erro.codigo, 'NAO_AUTORIZADO');
  await ponte.fechar();
});

test('invoca capacidade de leitura com sucesso', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capacidade: 'obter_estado' }),
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(dados.sucesso, true);
  await ponte.fechar();
});

test('rejeita capacidade fora do contrato', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capacidade: 'executar_comando_arbitrario' }),
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, 404);
  assert.equal(dados.erro.codigo, 'CAPACIDADE_DESCONHECIDA');
  await ponte.fechar();
});

test('rejeita corpo sem o campo capacidade', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ argumentos: {} }),
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, 400);
  assert.equal(dados.erro.codigo, 'CAMPO_OBRIGATORIO_AUSENTE');
  await ponte.fechar();
});

test('rejeita corpo JSON malformado', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{isto nao e json',
  });
  const dados = await resposta.json();
  assert.equal(resposta.status, 400);
  assert.equal(dados.erro.codigo, 'MENSAGEM_MALFORMADA');
  await ponte.fechar();
});

test('rejeita corpo acima do limite da ponte', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/invocar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capacidade: 'ecoar', argumentos: { texto: 'z'.repeat(9000) } }),
  }).catch(() => null);

  if (resposta !== null) {
    assert.equal(resposta.status, 413);
  }
  await ponte.fechar();
});

test('responde 404 para rota inexistente', async () => {
  const ponte = await subirPonte();
  const resposta = await fetch(`${ponte.base}/api/inexistente`);
  assert.equal(resposta.status, 404);
  await ponte.fechar();
});
