import { randomUUID } from 'node:crypto';

import { ERROR_CODES, LIMITS, PROTOCOL_VERSION } from './contract.js';

export class ProtocolError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    this.details = details;
  }
}

export function newRequestId() {
  return randomUUID().slice(0, 32);
}

export function buildRequest(capability, args, id = newRequestId()) {
  if (typeof capability !== 'string' || capability.length === 0) {
    throw new ProtocolError('CAMPO_OBRIGATORIO_AUSENTE', 'nome da capacidade ausente');
  }
  if (id.length > LIMITS.caracteresId) {
    throw new ProtocolError('ARGUMENTO_INVALIDO', 'identificador de correlacao excede o limite');
  }

  const request = {
    protocolo: PROTOCOL_VERSION,
    id,
    capacidade: capability,
    argumentos: args && typeof args === 'object' ? args : {},
  };

  const encoded = JSON.stringify(request);
  if (Buffer.byteLength(encoded, 'utf8') > LIMITS.bytesRequisicao) {
    throw new ProtocolError('MENSAGEM_EXCEDE_LIMITE', 'requisicao excede o limite de bytes do protocolo');
  }

  return { request, encoded };
}

export function parseResponse(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ProtocolError('MENSAGEM_MALFORMADA', 'resposta vazia do dispositivo');
  }
  if (Buffer.byteLength(raw, 'utf8') > LIMITS.bytesResposta) {
    throw new ProtocolError('MENSAGEM_EXCEDE_LIMITE', 'resposta excede o limite de bytes do protocolo');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProtocolError('MENSAGEM_MALFORMADA', 'resposta nao e um JSON valido');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProtocolError('MENSAGEM_MALFORMADA', 'resposta nao e um objeto JSON');
  }
  if (parsed.protocolo !== PROTOCOL_VERSION) {
    throw new ProtocolError('PROTOCOLO_INVALIDO', 'versao de protocolo divergente na resposta');
  }
  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new ProtocolError('CAMPO_OBRIGATORIO_AUSENTE', 'resposta sem identificador de correlacao');
  }
  if (typeof parsed.sucesso !== 'boolean') {
    throw new ProtocolError('MENSAGEM_MALFORMADA', 'resposta sem campo sucesso');
  }
  if (parsed.sucesso === false) {
    const code = parsed.erro && parsed.erro.codigo;
    if (typeof code !== 'string' || !ERROR_CODES.has(code)) {
      throw new ProtocolError('MENSAGEM_MALFORMADA', 'resposta de erro sem codigo conhecido');
    }
  }

  return parsed;
}

export function isProtocolFrame(line) {
  return typeof line === 'string' && line.trimStart().startsWith('{');
}
