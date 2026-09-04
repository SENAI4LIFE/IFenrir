import { EventEmitter } from 'node:events';

import { SerialPort } from 'serialport';

import { LIMITS, SENTINEL } from './contract.js';

const MAX_BUFFER = LIMITS.bytesResposta * 2;

export class SerialTransport extends EventEmitter {
  constructor({ path, baudRate = 115200, logger }) {
    super();
    this.name = 'serial';
    this.path = path;
    this.baudRate = baudRate;
    this.logger = logger;
    this.port = null;
    this.buffer = '';
  }

  describe() {
    return `${this.path} @ ${this.baudRate} bauds`;
  }

  open() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });

      this.port.on('data', (chunk) => this.#consume(chunk.toString('utf8')));
      this.port.on('close', () => this.emit('status', 'desconectado'));
      this.port.on('error', (error) => {
        this.logger.error('serial_erro', { mensagem: error.message });
        this.emit('status', 'desconectado');
      });

      this.port.open((error) => {
        if (error) {
          reject(new Error(`nao foi possivel abrir ${this.path}: ${error.message}`));
          return;
        }
        this.port.set({ dtr: false, rts: false }, () => {
          this.emit('status', 'conectado');
          resolve();
        });
      });
    });
  }

  #consume(text) {
    this.buffer += text;
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = this.buffer.slice(-MAX_BUFFER);
    }

    let index = this.buffer.indexOf('\n');
    while (index !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);

      const marker = line.indexOf(SENTINEL);
      if (marker !== -1) {
        this.emit('frame', line.slice(marker + SENTINEL.length));
      } else {
        this.emit('log', line);
      }

      index = this.buffer.indexOf('\n');
    }
  }

  send(encoded) {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        reject(new Error('porta serial fechada'));
        return;
      }
      this.port.write(`${SENTINEL}${encoded}\n`, (error) => {
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
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }
      this.port.close(() => resolve());
    });
  }
}
