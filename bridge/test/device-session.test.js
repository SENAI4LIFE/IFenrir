import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../src/contract.js';
import { DeviceSession } from '../src/device-session.js';
import { FakeDeviceTransport, silentLogger } from './fake-device.js';

async function abrirSessao(options = {}, sessionOptions = {}) {
  const transport = new FakeDeviceTransport(options);
  const session = new DeviceSession(transport, silentLogger(), sessionOptions);
  await session.open();
  return { transport, session };
}

test('invoca capacidade e correlaciona a resposta', async () => {
  const { session } = await abrirSessao();
  const resposta = await session.invoke('obter_estado', {}, { origem: 'teste' });
  assert.equal(resposta.sucesso, true);
  assert.equal(resposta.capacidade, 'obter_estado');
  assert.ok(typeof resposta.msPonte === 'number');
});

test('rejeita capacidade fora do contrato antes de tocar o transporte', async () => {
  const { transport, session } = await abrirSessao();
  await assert.rejects(
    () => session.invoke('executar_shell', {}),
    (error) => error.code === 'CAPACIDADE_DESCONHECIDA',
  );
  assert.equal(transport.sent.length, 0);
});

test('falha com DISPOSITIVO_DESCONECTADO quando nao ha sessao', async () => {
  const transport = new FakeDeviceTransport();
  const session = new DeviceSession(transport, silentLogger());
  await assert.rejects(
    () => session.invoke('obter_estado', {}),
    (error) => error.code === 'DISPOSITIVO_DESCONECTADO',
  );
});

test('aplica tempo limite quando o dispositivo nao responde', async () => {
  const { session } = await abrirSessao({ silent: true }, { timeoutMs: 120 });
  await assert.rejects(
    () => session.invoke('obter_estado', {}),
    (error) => error.code === 'TEMPO_ESGOTADO',
  );
});

test('falha requisicoes pendentes quando o transporte cai', async () => {
  const { transport, session } = await abrirSessao({ silent: true }, { timeoutMs: 5000 });
  const pendente = session.invoke('obter_estado', {});
  setTimeout(() => transport.disconnect(), 20);
  await assert.rejects(pendente, (error) => error.code === 'DISPOSITIVO_DESCONECTADO');
});

test('propaga erro estruturado devolvido pelo dispositivo', async () => {
  const { session } = await abrirSessao({
    responder: (request) => ({
      protocolo: PROTOCOL_VERSION,
      id: request.id,
      sucesso: false,
      erro: { codigo: 'CAPACIDADE_NAO_PERMITIDA', mensagem: 'atuador desabilitado' },
      ms: 1,
    }),
  });

  const resposta = await session.invoke('definir_led', { ligado: true });
  assert.equal(resposta.sucesso, false);
  assert.equal(resposta.erro.codigo, 'CAPACIDADE_NAO_PERMITIDA');
});

test('ignora quadro com correlacao desconhecida e ainda expira', async () => {
  const { session } = await abrirSessao(
    {
      responder: (request) => ({
        protocolo: PROTOCOL_VERSION,
        id: `${request.id}-outro`,
        sucesso: true,
        resultado: {},
        ms: 1,
      }),
    },
    { timeoutMs: 120 },
  );

  await assert.rejects(
    () => session.invoke('obter_estado', {}),
    (error) => error.code === 'TEMPO_ESGOTADO',
  );
});

test('ignora quadro malformado sem derrubar a sessao', async () => {
  const { session } = await abrirSessao({ responder: () => 'isto nao e json' }, { timeoutMs: 120 });
  await assert.rejects(
    () => session.invoke('obter_estado', {}),
    (error) => error.code === 'TEMPO_ESGOTADO',
  );
  assert.equal(session.connected, true);
});

test('converte falha de envio em DISPOSITIVO_DESCONECTADO', async () => {
  const { session } = await abrirSessao({ failSend: true });
  await assert.rejects(
    () => session.invoke('obter_estado', {}),
    (error) => error.code === 'DISPOSITIVO_DESCONECTADO',
  );
});

test('expoe estado observavel da sessao', async () => {
  const { session } = await abrirSessao();
  const status = session.status;
  assert.equal(status.conectado, true);
  assert.equal(status.transporte, 'fake');
  assert.equal(status.requisicoesPendentes, 0);
});
