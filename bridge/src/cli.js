#!/usr/bin/env node
import { createServer } from 'node:http';

import { createLogger } from './logger.js';
import { loadConfig, describeConfig } from './config.js';
import { DeviceSession } from './device-session.js';
import { SerialTransport } from './serial-transport.js';
import { WebSocketTransport } from './websocket-transport.js';
import { createHttpServer } from './http-server.js';
import { createMcpServer } from './mcp-server.js';
import { listCandidates, selectPort } from './device-detect.js';
import { ProtocolError } from './protocol.js';

async function buildSession(config, logger, httpServer) {
  if (config.transport === 'websocket') {
    if (!config.deviceToken) {
      throw new Error('IFENRIR_DEVICE_TOKEN e obrigatorio para o transporte websocket');
    }
    const transport = new WebSocketTransport({
      server: httpServer,
      path: '/dispositivo',
      deviceToken: config.deviceToken,
      logger,
    });
    return new DeviceSession(transport, logger, { timeoutMs: config.timeoutMs });
  }

  const selected = await selectPort(config.serialPort);
  logger.info('porta_selecionada', {
    caminho: selected.caminho,
    ponte: selected.ponte,
    descricao: selected.descricao,
  });

  const transport = new SerialTransport({
    path: selected.caminho,
    baudRate: config.baudRate,
    logger,
  });
  transport.on('log', (line) => {
    if (line.trim().length > 0) {
      logger.info('dispositivo_log', { linha: line.slice(0, 200) });
    }
  });

  return new DeviceSession(transport, logger, { timeoutMs: config.timeoutMs });
}

async function commandDetect() {
  const candidates = await listCandidates();
  if (candidates.length === 0) {
    process.stdout.write('Nenhuma porta serial foi encontrada neste computador.\n');
    return 1;
  }

  process.stdout.write('Portas seriais detectadas:\n');
  for (const item of candidates) {
    const marker = item.provavel ? '  [provavel ESP32]' : '';
    const bridge = item.ponte ? ` ponte=${item.ponte}` : '';
    process.stdout.write(`  ${item.caminho}  ${item.descricao ?? 'sem descricao'}${bridge}${marker}\n`);
  }

  const likely = candidates.filter((item) => item.provavel);
  process.stdout.write(`\nInterfaces provaveis: ${likely.length}\n`);
  return likely.length === 1 ? 0 : 1;
}

async function commandServe(config, logger) {
  const httpServer = createServer();
  const session = await buildSession(config, logger, httpServer);
  const app = createHttpServer({ session, logger, env: config.env });

  httpServer.on('request', (request, response) => app.emit('request', request, response));

  await session.open();

  await new Promise((resolve) => httpServer.listen(config.port, config.host, resolve));

  logger.info('ponte_pronta', describeConfig(config));
  process.stdout.write(`IFenrir: painel disponivel em http://${config.host}:${config.port}/\n`);

  const shutdown = async () => {
    logger.info('encerrando', {});
    await session.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return null;
}

async function commandMcp(config, logger) {
  const httpServer = createServer();
  const session = await buildSession(config, logger, httpServer);
  await session.open();

  if (config.transport === 'websocket') {
    await new Promise((resolve) => httpServer.listen(config.port, config.host, resolve));
  }

  const mcp = createMcpServer({ session, logger, scopes: config.mcpScopes });
  await mcp.connectStdio();
  return null;
}

async function commandProbe(config, logger) {
  const httpServer = createServer();
  const session = await buildSession(config, logger, httpServer);
  await session.open();

  if (config.transport === 'websocket') {
    await new Promise((resolve) => httpServer.listen(config.port, config.host, resolve));
    process.stdout.write('Aguardando o dispositivo conectar ao transporte WebSocket...\n');
  }

  const deadline = Date.now() + 15000;
  while (!session.connected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    const response = await session.invoke('listar_capacidades', {}, { origem: 'probe' });
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return response.sucesso ? 0 : 1;
  } finally {
    await session.close();
    httpServer.close();
  }
}

async function main() {
  const command = process.argv[2] ?? 'serve';
  const logger = createLogger(process.stderr);

  if (command === 'detect') {
    process.exit(await commandDetect());
  }

  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`Configuracao invalida: ${error.message}\n`);
    process.exit(2);
  }

  try {
    if (command === 'serve') {
      await commandServe(config, logger);
      return;
    }
    if (command === 'mcp') {
      await commandMcp(config, logger);
      return;
    }
    if (command === 'probe') {
      process.exit(await commandProbe(config, logger));
    }

    process.stderr.write(`Comando desconhecido: ${command}. Use serve, mcp, probe ou detect.\n`);
    process.exit(2);
  } catch (error) {
    const code = error instanceof ProtocolError ? error.code : 'FALHA_INTERNA';
    logger.error('falha_fatal', { codigo: code, mensagem: error.message });
    process.stderr.write(`IFenrir: ${error.message}\n`);
    process.exit(1);
  }
}

main();
