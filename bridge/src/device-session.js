import { EventEmitter } from 'node:events';

import { LIMITS, findCapability } from './contract.js';
import { ProtocolError, buildRequest, newRequestId, parseResponse } from './protocol.js';

export class DeviceSession extends EventEmitter {
  constructor(transport, logger, options = {}) {
    super();
    this.transport = transport;
    this.logger = logger;
    this.timeoutMs = options.timeoutMs ?? LIMITS.tempoLimiteMs;
    this.pending = new Map();
    this.connected = false;
    this.lastSeenAt = null;

    this.transport.on('frame', (line) => this.#handleFrame(line));
    this.transport.on('status', (state) => {
      this.connected = state === 'conectado';
      if (!this.connected) {
        this.#failAll('DISPOSITIVO_DESCONECTADO', 'dispositivo desconectado durante a requisicao');
      }
      this.emit('status', state);
      this.logger.info('transporte', { estado: state, transporte: this.transport.name });
    });
  }

  async open() {
    await this.transport.open();
  }

  async close() {
    this.#failAll('DISPOSITIVO_DESCONECTADO', 'ponte encerrada');
    await this.transport.close();
  }

  get status() {
    return {
      conectado: this.connected,
      transporte: this.transport.name,
      descricao: this.transport.describe(),
      ultimaResposta: this.lastSeenAt,
      requisicoesPendentes: this.pending.size,
    };
  }

  #failAll(code, message) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new ProtocolError(code, message));
      this.pending.delete(id);
    }
  }

  #handleFrame(line) {
    this.lastSeenAt = new Date().toISOString();

    let response;
    try {
      response = parseResponse(line);
    } catch (error) {
      this.logger.warn('quadro_invalido', { motivo: error.code ?? 'MENSAGEM_MALFORMADA' });
      return;
    }

    const entry = this.pending.get(response.id);
    if (!entry) {
      this.logger.warn('correlacao_desconhecida', { id: response.id });
      return;
    }

    clearTimeout(entry.timer);
    this.pending.delete(response.id);
    entry.resolve(response);
  }

  async invoke(capability, args = {}, context = {}) {
    const declared = findCapability(capability);
    if (!declared) {
      throw new ProtocolError('CAPACIDADE_DESCONHECIDA', `capacidade nao declarada no contrato: ${capability}`);
    }
    if (!this.connected) {
      throw new ProtocolError('DISPOSITIVO_DESCONECTADO', 'nenhum dispositivo IFenrir conectado a ponte');
    }

    const id = newRequestId();
    const { encoded } = buildRequest(capability, args, id);
    const startedAt = process.hrtime.bigint();

    this.logger.info('invocacao_inicio', {
      id,
      origem: context.origem ?? 'desconhecida',
      capacidade: capability,
    });

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProtocolError('TEMPO_ESGOTADO', `dispositivo nao respondeu em ${this.timeoutMs} ms`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      Promise.resolve(this.transport.send(encoded)).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new ProtocolError('DISPOSITIVO_DESCONECTADO', error.message));
      });
    }).catch((error) => {
      this.logger.error('invocacao_fim', {
        id,
        origem: context.origem ?? 'desconhecida',
        capacidade: capability,
        resultado: 'erro',
        codigo: error.code ?? 'FALHA_INTERNA',
        ms: Number((process.hrtime.bigint() - startedAt) / 1000000n),
      });
      throw error;
    });

    const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);

    this.logger.info('invocacao_fim', {
      id,
      origem: context.origem ?? 'desconhecida',
      capacidade: capability,
      resultado: response.sucesso ? 'sucesso' : 'erro',
      codigo: response.sucesso ? null : response.erro.codigo,
      ms: elapsedMs,
    });

    return { ...response, msPonte: elapsedMs };
  }
}
