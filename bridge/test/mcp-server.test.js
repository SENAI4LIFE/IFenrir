import assert from 'node:assert/strict';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { PROTOCOL_VERSION } from '../src/contract.js';
import { DeviceSession } from '../src/device-session.js';
import { createMcpServer } from '../src/mcp-server.js';
import { FakeDeviceTransport, silentLogger } from './fake-device.js';

async function conectar(scopes, transportOptions = {}) {
  const transport = new FakeDeviceTransport(transportOptions);
  const session = new DeviceSession(transport, silentLogger());
  await session.open();

  const { server } = createMcpServer({ session, logger: silentLogger(), scopes });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: 'teste-ifenrir', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, session, server };
}

test('expoe somente ferramentas de leitura no escopo padrao', async () => {
  const { client, session } = await conectar(new Set(['leitura']));
  const { tools } = await client.listTools();
  const nomes = tools.map((item) => item.name);

  assert.ok(nomes.includes('obter_estado'));
  assert.ok(nomes.includes('listar_capacidades'));
  assert.ok(!nomes.includes('definir_rotulo'));
  assert.ok(!nomes.includes('definir_led'));

  await client.close();
  await session.close();
});

test('expoe ferramentas de escrita quando o escopo permite', async () => {
  const { client, session } = await conectar(new Set(['leitura', 'escrita']));
  const { tools } = await client.listTools();
  const nomes = tools.map((item) => item.name);

  assert.ok(nomes.includes('definir_rotulo'));
  assert.ok(nomes.includes('definir_led'));

  await client.close();
  await session.close();
});

test('cada ferramenta declara descricao em portugues', async () => {
  const { client, session } = await conectar(new Set(['leitura']));
  const { tools } = await client.listTools();

  for (const tool of tools) {
    assert.ok(typeof tool.description === 'string' && tool.description.length > 10);
    assert.match(tool.description, /ESP32 IFenrir/);
  }

  await client.close();
  await session.close();
});

test('invocar ferramenta encaminha a capacidade ao dispositivo', async () => {
  const { client, session } = await conectar(new Set(['leitura']));
  const resultado = await client.callTool({ name: 'obter_estado', arguments: {} });
  const carga = JSON.parse(resultado.content[0].text);

  assert.equal(carga.sucesso, true);
  assert.equal(carga.capacidade, 'obter_estado');
  assert.ok(typeof carga.latencia_ponte_ms === 'number');

  await client.close();
  await session.close();
});

test('erro estruturado do dispositivo vira isError no MCP', async () => {
  const { client, session } = await conectar(new Set(['leitura', 'escrita']), {
    responder: (request) => ({
      protocolo: PROTOCOL_VERSION,
      id: request.id,
      sucesso: false,
      erro: { codigo: 'CAPACIDADE_NAO_PERMITIDA', mensagem: 'atuador desabilitado' },
      ms: 1,
    }),
  });

  const resultado = await client.callTool({ name: 'definir_led', arguments: { ligado: true } });
  const carga = JSON.parse(resultado.content[0].text);

  assert.equal(resultado.isError, true);
  assert.equal(carga.erro.codigo, 'CAPACIDADE_NAO_PERMITIDA');

  await client.close();
  await session.close();
});

test('argumento invalido e recusado pelo esquema antes do dispositivo', async () => {
  const { client, session, } = await conectar(new Set(['leitura']));
  const resultado = await client.callTool({ name: 'ecoar', arguments: { texto: '' } });
  assert.equal(resultado.isError, true);

  await client.close();
  await session.close();
});

test('dispositivo desconectado vira erro estruturado no MCP', async () => {
  const transport = new FakeDeviceTransport();
  const session = new DeviceSession(transport, silentLogger());
  const { server } = createMcpServer({ session, logger: silentLogger(), scopes: new Set(['leitura']) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste-ifenrir', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const resultado = await client.callTool({ name: 'obter_estado', arguments: {} });
  const carga = JSON.parse(resultado.content[0].text);

  assert.equal(resultado.isError, true);
  assert.equal(carga.erro.codigo, 'DISPOSITIVO_DESCONECTADO');

  await client.close();
});
