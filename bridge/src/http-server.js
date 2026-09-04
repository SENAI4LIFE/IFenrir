import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPABILITIES, LIMITS, capabilitiesForScopes, scopeForCapability } from './contract.js';
import { ProtocolError } from './protocol.js';
import { createTokenRegistry, extractBearer } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const panelPath = join(here, '..', 'public', 'index.html');

const MAX_BODY_BYTES = 4096;

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function sendError(response, status, code, message) {
  sendJson(response, status, { sucesso: false, erro: { codigo: code, mensagem: message } });
}

function statusForCode(code) {
  switch (code) {
    case 'NAO_AUTENTICADO':
      return 401;
    case 'NAO_AUTORIZADO':
    case 'CAPACIDADE_NAO_PERMITIDA':
      return 403;
    case 'CAPACIDADE_DESCONHECIDA':
      return 404;
    case 'TEMPO_ESGOTADO':
      return 504;
    case 'DISPOSITIVO_DESCONECTADO':
      return 503;
    case 'MENSAGEM_EXCEDE_LIMITE':
      return 413;
    case 'PROTOCOLO_INVALIDO':
    case 'MENSAGEM_MALFORMADA':
    case 'CAMPO_OBRIGATORIO_AUSENTE':
    case 'ARGUMENTO_INVALIDO':
      return 400;
    default:
      return 500;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ProtocolError('MENSAGEM_EXCEDE_LIMITE', 'corpo da requisicao excede o limite da ponte'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ProtocolError('MENSAGEM_MALFORMADA', 'corpo deve ser um objeto JSON'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new ProtocolError('MENSAGEM_MALFORMADA', 'corpo nao e um JSON valido'));
      }
    });

    request.on('error', () => reject(new ProtocolError('MENSAGEM_MALFORMADA', 'falha ao ler o corpo')));
  });
}

export function createHttpServer({ session, logger, env = process.env }) {
  const tokens = createTokenRegistry(env);
  const panel = readFileSync(panelPath, 'utf8');

  const authorize = (request) => {
    if (!tokens.enabled) {
      return { scopes: new Set(['leitura', 'escrita']), label: 'aberto' };
    }
    const presented = extractBearer(request.headers.authorization) ?? request.headers['x-ifenrir-token'];
    const identity = tokens.authenticate(presented);
    if (!identity) {
      throw new ProtocolError('NAO_AUTENTICADO', 'credencial ausente ou invalida');
    }
    return identity;
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'x-content-type-options': 'nosniff',
        });
        response.end(panel);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/saude') {
        sendJson(response, 200, {
          sucesso: true,
          servico: 'ifenrir-bridge',
          protocolo: LIMITS ? 'ifenrir/1' : null,
          dispositivo: session.status,
          autenticacao: tokens.enabled ? 'token' : 'aberta',
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/capacidades') {
        const identity = authorize(request);
        sendJson(response, 200, {
          sucesso: true,
          escopos: [...identity.scopes],
          contrato: CAPABILITIES,
          permitidas: capabilitiesForScopes(identity.scopes).map((item) => item.nome),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/invocar') {
        const identity = authorize(request);
        const body = await readBody(request);

        const capability = body.capacidade;
        if (typeof capability !== 'string' || capability.length === 0) {
          throw new ProtocolError('CAMPO_OBRIGATORIO_AUSENTE', 'campo capacidade e obrigatorio');
        }

        const required = scopeForCapability(capability);
        if (required === null) {
          throw new ProtocolError('CAPACIDADE_DESCONHECIDA', `capacidade nao declarada: ${capability}`);
        }
        if (!identity.scopes.has(required)) {
          throw new ProtocolError('NAO_AUTORIZADO', `o escopo ${required} e necessario para ${capability}`);
        }

        const result = await session.invoke(capability, body.argumentos ?? {}, {
          origem: `http:${identity.label}`,
        });
        sendJson(response, result.sucesso ? 200 : statusForCode(result.erro.codigo), result);
        return;
      }

      sendError(response, 404, 'CAPACIDADE_DESCONHECIDA', 'rota nao encontrada');
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : 'FALHA_INTERNA';
      logger.warn('http_erro', { rota: url.pathname, codigo: code });
      sendError(response, statusForCode(code), code, error.message);
    }
  });

  return server;
}
