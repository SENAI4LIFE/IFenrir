import { EventEmitter } from 'node:events';
import { timingSafeEqual } from 'node:crypto';

import { WebSocketServer } from 'ws';

import { LIMITS } from './contract.js';

function safeCompare(received, expected) {
  const a = Buffer.from(String(received ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export class WebSocketTransport extends EventEmitter {
  constructor({ server, path = '/dispositivo', deviceToken, logger }) {
    super();
    this.name = 'websocket';
    this.path = path;
    this.deviceToken = deviceToken;
    this.logger = logger;
    this.socket = null;
    this.deviceId = null;
    this.wss = new WebSocketServer({ server, path, maxPayload: LIMITS.bytesRequisicao * 4 });

    this.wss.on('connection', (socket, request) => this.#accept(socket, request));
  }

  describe() {
    return this.socket ? `${this.deviceId ?? 'dispositivo'} via ${this.path}` : `aguardando conexao em ${this.path}`;
  }

  #accept(socket, request) {
    const token = request.headers['x-ifenrir-token'];
    const deviceId = request.headers['x-ifenrir-dispositivo'];

    if (!safeCompare(token, this.deviceToken)) {
      this.logger.warn('dispositivo_recusado', { motivo: 'NAO_AUTENTICADO' });
      socket.close(1008, 'nao autenticado');
      return;
    }

    if (this.socket) {
      this.logger.warn('dispositivo_recusado', { motivo: 'sessao ja ocupada' });
      socket.close(1013, 'ponte ja possui um dispositivo conectado');
      return;
    }

    this.socket = socket;
    this.deviceId = typeof deviceId === 'string' ? deviceId.slice(0, 64) : 'dispositivo';
    this.logger.info('dispositivo_conectado', { dispositivo: this.deviceId });
    this.emit('status', 'conectado');

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        return;
      }
      this.emit('frame', data.toString('utf8'));
    });

    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.deviceId = null;
        this.emit('status', 'desconectado');
      }
    });

    socket.on('error', (error) => {
      this.logger.error('websocket_erro', { mensagem: error.message });
    });
  }

  open() {
    return Promise.resolve();
  }

  send(encoded) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
        reject(new Error('nenhum dispositivo conectado ao transporte WebSocket'));
        return;
      }
      this.socket.send(encoded, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
      if (this.socket) {
        this.socket.terminate();
      }
    });
  }
}
