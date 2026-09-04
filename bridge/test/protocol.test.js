import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITS, PROTOCOL_VERSION } from '../src/contract.js';
import { ProtocolError, buildRequest, parseResponse } from '../src/protocol.js';

test('monta uma requisicao valida com correlacao e versao', () => {
  const { request, encoded } = buildRequest('obter_estado', {}, 'abc-123');
  assert.equal(request.protocolo, PROTOCOL_VERSION);
  assert.equal(request.id, 'abc-123');
  assert.equal(request.capacidade, 'obter_estado');
  assert.deepEqual(request.argumentos, {});
  assert.equal(JSON.parse(encoded).id, 'abc-123');
});

test('recusa requisicao sem nome de capacidade', () => {
  assert.throws(() => buildRequest('', {}), (error) => error.code === 'CAMPO_OBRIGATORIO_AUSENTE');
});

test('recusa identificador de correlacao acima do limite', () => {
  const longo = 'x'.repeat(LIMITS.caracteresId + 1);
  assert.throws(() => buildRequest('obter_estado', {}, longo), (error) => error.code === 'ARGUMENTO_INVALIDO');
});

test('recusa requisicao que excede o limite de bytes', () => {
  const grande = { texto: 'y'.repeat(LIMITS.bytesRequisicao) };
  assert.throws(
    () => buildRequest('ecoar', grande),
    (error) => error.code === 'MENSAGEM_EXCEDE_LIMITE',
  );
});

test('aceita resposta de sucesso bem formada', () => {
  const resposta = parseResponse(
    JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'a', sucesso: true, resultado: { ok: 1 }, ms: 3 }),
  );
  assert.equal(resposta.sucesso, true);
  assert.equal(resposta.id, 'a');
});

test('aceita resposta de erro com codigo conhecido', () => {
  const resposta = parseResponse(
    JSON.stringify({
      protocolo: PROTOCOL_VERSION,
      id: 'a',
      sucesso: false,
      erro: { codigo: 'CAPACIDADE_DESCONHECIDA', mensagem: 'x' },
    }),
  );
  assert.equal(resposta.sucesso, false);
  assert.equal(resposta.erro.codigo, 'CAPACIDADE_DESCONHECIDA');
});

test('rejeita JSON malformado', () => {
  assert.throws(() => parseResponse('{nao json'), (error) => error.code === 'MENSAGEM_MALFORMADA');
});

test('rejeita resposta vazia', () => {
  assert.throws(() => parseResponse(''), (error) => error.code === 'MENSAGEM_MALFORMADA');
});

test('rejeita resposta que nao e objeto', () => {
  assert.throws(() => parseResponse('[1,2,3]'), (error) => error.code === 'MENSAGEM_MALFORMADA');
});

test('rejeita versao de protocolo divergente', () => {
  assert.throws(
    () => parseResponse(JSON.stringify({ protocolo: 'ifenrir/999', id: 'a', sucesso: true })),
    (error) => error.code === 'PROTOCOLO_INVALIDO',
  );
});

test('rejeita resposta sem identificador de correlacao', () => {
  assert.throws(
    () => parseResponse(JSON.stringify({ protocolo: PROTOCOL_VERSION, sucesso: true })),
    (error) => error.code === 'CAMPO_OBRIGATORIO_AUSENTE',
  );
});

test('rejeita resposta sem campo sucesso', () => {
  assert.throws(
    () => parseResponse(JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'a' })),
    (error) => error.code === 'MENSAGEM_MALFORMADA',
  );
});

test('rejeita erro com codigo desconhecido', () => {
  assert.throws(
    () => parseResponse(JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'a', sucesso: false, erro: { codigo: 'XPTO' } })),
    (error) => error.code === 'MENSAGEM_MALFORMADA',
  );
});

test('rejeita resposta acima do limite de bytes', () => {
  const enorme = JSON.stringify({
    protocolo: PROTOCOL_VERSION,
    id: 'a',
    sucesso: true,
    resultado: { texto: 'z'.repeat(LIMITS.bytesResposta) },
  });
  assert.throws(() => parseResponse(enorme), (error) => error.code === 'MENSAGEM_EXCEDE_LIMITE');
});

test('ProtocolError preserva codigo estavel', () => {
  const erro = new ProtocolError('TEMPO_ESGOTADO', 'x');
  assert.equal(erro.code, 'TEMPO_ESGOTADO');
  assert.equal(erro.name, 'ProtocolError');
});
