import { EventEmitter } from 'node:events';

import { PROTOCOL_VERSION } from '../src/contract.js';

export class FakeDeviceTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = 'fake';
    this.sent = [];
    this.silent = options.silent ?? false;
    this.responder = options.responder ?? null;
    this.failSend = options.failSend ?? false;
  }

  describe() {
    return 'transporte de teste';
  }

  open() {
    this.emit('status', 'conectado');
    return Promise.resolve();
  }

  close() {
    this.emit('status', 'desconectado');
    return Promise.resolve();
  }

  disconnect() {
    this.emit('status', 'desconectado');
  }

  send(encoded) {
    if (this.failSend) {
      return Promise.reject(new Error('transporte indisponivel'));
    }

    this.sent.push(encoded);
    if (this.silent) {
      return Promise.resolve();
    }

    const request = JSON.parse(encoded);
    const frame = this.responder
      ? this.responder(request)
      : {
          protocolo: PROTOCOL_VERSION,
          id: request.id,
          sucesso: true,
          capacidade: request.capacidade,
          resultado: { eco: request.capacidade },
          ms: 2,
        };

    if (frame !== null) {
      queueMicrotask(() => this.emit('frame', typeof frame === 'string' ? frame : JSON.stringify(frame)));
    }
    return Promise.resolve();
  }
}

export function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}
