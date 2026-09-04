import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITIES,
  ERROR_CODES,
  LIMITS,
  PROTOCOL_VERSION,
  capabilitiesForScopes,
  findCapability,
  scopeForCapability,
} from '../src/contract.js';

test('contrato declara versao e limites coerentes', () => {
  assert.equal(PROTOCOL_VERSION, 'ifenrir/1');
  assert.ok(LIMITS.bytesRequisicao > 0);
  assert.ok(LIMITS.bytesResposta >= LIMITS.bytesRequisicao);
  assert.ok(LIMITS.tempoLimiteMs > 0);
});

test('todos os codigos de erro sao unicos e em caixa alta', () => {
  const lista = [...ERROR_CODES];
  assert.equal(lista.length, new Set(lista).size);
  for (const code of lista) {
    assert.match(code, /^[A-Z_]+$/);
  }
});

test('nomes de capacidade sao unicos', () => {
  const nomes = CAPABILITIES.map((item) => item.nome);
  assert.equal(nomes.length, new Set(nomes).size);
});

test('cada capacidade declara tipo leitura ou escrita', () => {
  for (const capability of CAPABILITIES) {
    assert.ok(['leitura', 'escrita'].includes(capability.tipo), `${capability.nome} com tipo invalido`);
    assert.ok(typeof capability.resumo === 'string' && capability.resumo.length > 0);
  }
});

test('escopo de leitura nao expoe capacidades de escrita', () => {
  const somenteLeitura = capabilitiesForScopes(new Set(['leitura']));
  assert.ok(somenteLeitura.length > 0);
  assert.ok(somenteLeitura.every((item) => item.tipo === 'leitura'));
  assert.ok(!somenteLeitura.some((item) => item.nome === 'definir_rotulo'));
});

test('escopo completo expoe leitura e escrita', () => {
  const completo = capabilitiesForScopes(new Set(['leitura', 'escrita']));
  assert.equal(completo.length, CAPABILITIES.length);
});

test('mapeia capacidade para o escopo exigido', () => {
  assert.equal(scopeForCapability('obter_estado'), 'leitura');
  assert.equal(scopeForCapability('definir_rotulo'), 'escrita');
  assert.equal(scopeForCapability('definir_led'), 'escrita');
  assert.equal(scopeForCapability('executar_shell'), null);
});

test('o contrato nao declara capacidades de execucao arbitraria', () => {
  const proibidas = /shell|exec|comando|eval|gpio_write|memoria_escrita|arquivo/i;
  for (const capability of CAPABILITIES) {
    assert.ok(!proibidas.test(capability.nome), `capacidade perigosa declarada: ${capability.nome}`);
  }
});

test('capacidades obrigatorias da pesquisa estao presentes', () => {
  const exigidas = [
    'listar_capacidades',
    'obter_informacoes_dispositivo',
    'obter_estado',
    'obter_tempo_atividade',
    'obter_memoria_livre',
    'obter_memoria_minima',
    'obter_motivo_reinicio',
    'obter_estado_wifi',
    'obter_rssi_wifi',
  ];
  for (const nome of exigidas) {
    assert.ok(findCapability(nome), `capacidade ausente no contrato: ${nome}`);
  }
});

test('definir_led e declarada como condicional', () => {
  const led = findCapability('definir_led');
  assert.equal(led.condicional, true);
  assert.ok(typeof led.condicao === 'string' && led.condicao.length > 0);
});
