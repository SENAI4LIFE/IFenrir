import { timingSafeEqual } from 'node:crypto';

export const ALL_SCOPES = ['leitura', 'escrita'];

export function parseScopes(raw, fallback) {
  const source = typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
  const scopes = new Set(
    String(source)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => ALL_SCOPES.includes(item)),
  );
  return scopes;
}

function safeCompare(received, expected) {
  const a = Buffer.from(String(received ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createTokenRegistry(env) {
  const entries = [];

  if (env.IFENRIR_API_TOKEN) {
    entries.push({
      token: env.IFENRIR_API_TOKEN,
      scopes: parseScopes(env.IFENRIR_API_SCOPES, 'leitura,escrita'),
      label: 'operador',
    });
  }

  if (env.IFENRIR_API_TOKEN_LEITURA) {
    entries.push({
      token: env.IFENRIR_API_TOKEN_LEITURA,
      scopes: parseScopes('leitura', 'leitura'),
      label: 'observador',
    });
  }

  return {
    get enabled() {
      return entries.length > 0;
    },
    authenticate(presented) {
      for (const entry of entries) {
        if (safeCompare(presented, entry.token)) {
          return { scopes: entry.scopes, label: entry.label };
        }
      }
      return null;
    },
  };
}

export function extractBearer(headerValue) {
  if (typeof headerValue !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}
