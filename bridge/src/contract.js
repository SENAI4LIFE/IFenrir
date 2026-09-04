import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = join(here, '..', '..', 'protocolo', 'ifenrir-protocolo.json');

export const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

export const PROTOCOL_VERSION = contract.protocolo;
export const LIMITS = contract.limites;
export const ERROR_CODES = new Set(contract.codigosErro);
export const SENTINEL = '@IFENRIR@';

export const CAPABILITIES = contract.capacidades;

export const CAPABILITY_NAMES = new Set(CAPABILITIES.map((item) => item.nome));

export function findCapability(name) {
  return CAPABILITIES.find((item) => item.nome === name);
}

export function capabilitiesForScopes(scopes) {
  return CAPABILITIES.filter((item) => {
    if (item.tipo === 'escrita') {
      return scopes.has('escrita');
    }
    return scopes.has('leitura');
  });
}

export function scopeForCapability(name) {
  const capability = findCapability(name);
  if (!capability) {
    return null;
  }
  return capability.tipo === 'escrita' ? 'escrita' : 'leitura';
}
