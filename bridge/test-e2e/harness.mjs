import { PROTOCOL_VERSION } from '../src/contract.js';
import { DeviceSession } from '../src/device-session.js';
import { createHttpServer } from '../src/http-server.js';
import { FakeDeviceTransport } from '../test/fake-device.js';

import {
  PORTA_ABERTO,
  PORTA_CONECTADO,
  PORTA_DESCONECTADO,
  TOKEN_LEITURA,
  TOKEN_OPERADOR,
} from './config.mjs';

const silent = { info() {}, warn() {}, error() {} };

function erro(request, codigo, mensagem) {
  return {
    protocolo: PROTOCOL_VERSION,
    id: request.id,
    sucesso: false,
    erro: { codigo, mensagem },
    ms: 1,
  };
}

function sucesso(request, resultado) {
  return {
    protocolo: PROTOCOL_VERSION,
    id: request.id,
    sucesso: true,
    capacidade: request.capacidade,
    resultado,
    ms: 2,
  };
}

function responderComoDispositivo(request) {
  const argumentos = request.argumentos ?? {};

  if (request.capacidade === 'definir_led') {
    return erro(request, 'CAPACIDADE_NAO_PERMITIDA', 'atuador desabilitado na configuracao do firmware');
  }

  if (request.capacidade === 'ecoar') {
    if (typeof argumentos.texto !== 'string' || argumentos.texto.length === 0) {
      return erro(request, 'ARGUMENTO_INVALIDO', 'argumento texto deve ser uma string');
    }
    if (argumentos.texto.length > 128) {
      return erro(request, 'ARGUMENTO_INVALIDO', 'argumento texto excede 128 caracteres');
    }
    return sucesso(request, { texto: argumentos.texto });
  }

  if (request.capacidade === 'definir_rotulo') {
    if (typeof argumentos.rotulo !== 'string' || argumentos.rotulo.length === 0 || argumentos.rotulo.length > 32) {
      return erro(request, 'ARGUMENTO_INVALIDO', 'rotulo deve ter entre 1 e 32 caracteres');
    }
    return sucesso(request, { rotulo: argumentos.rotulo, persistido: true });
  }

  if (request.capacidade === 'obter_rssi_wifi') {
    return erro(request, 'FALHA_INTERNA', 'dispositivo nao associado a um ponto de acesso');
  }

  if (request.capacidade === 'listar_capacidades') {
    return sucesso(request, { capacidades: [] });
  }

  return sucesso(request, {
    dispositivo: 'ifenrir-e2e01',
    rotulo: 'bancada-e2e',
    tempo_atividade_ms: 123456,
    memoria_livre_bytes: 283360,
    memoria_minima_bytes: 276360,
    motivo_reinicio: 'energizacao',
    wifi: 'desabilitada',
    ip: '0.0.0.0',
    rssi_dbm: null,
  });
}

async function subir({ porta, conectado, env }) {
  const transport = new FakeDeviceTransport({ responder: responderComoDispositivo });
  const session = new DeviceSession(transport, silent, { timeoutMs: 1500 });

  if (conectado) {
    await session.open();
  }

  const server = createHttpServer({ session, logger: silent, env });
  await new Promise((resolve) => server.listen(porta, '127.0.0.1', resolve));
  return server;
}

const servidores = await Promise.all([
  subir({
    porta: PORTA_CONECTADO,
    conectado: true,
    env: { IFENRIR_API_TOKEN: TOKEN_OPERADOR, IFENRIR_API_TOKEN_LEITURA: TOKEN_LEITURA },
  }),
  subir({
    porta: PORTA_DESCONECTADO,
    conectado: false,
    env: { IFENRIR_API_TOKEN: TOKEN_OPERADOR },
  }),
  subir({ porta: PORTA_ABERTO, conectado: true, env: {} }),
]);

process.stdout.write(`harness IFenrir ativo em ${PORTA_CONECTADO}, ${PORTA_DESCONECTADO} e ${PORTA_ABERTO}\n`);

const encerrar = () => {
  for (const servidor of servidores) {
    servidor.close();
  }
  process.exit(0);
};

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
