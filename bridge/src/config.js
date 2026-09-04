import { parseScopes } from './auth.js';

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  const transport = (env.IFENRIR_TRANSPORT ?? 'serial').toLowerCase();

  if (transport !== 'serial' && transport !== 'websocket') {
    throw new Error(`IFENRIR_TRANSPORT deve ser "serial" ou "websocket", recebido: ${transport}`);
  }

  return {
    transport,
    serialPort: env.IFENRIR_SERIAL_PORT ?? null,
    baudRate: integer(env.IFENRIR_SERIAL_BAUD, 115200),
    host: env.IFENRIR_HOST ?? '0.0.0.0',
    port: integer(env.IFENRIR_PORT, 8787),
    deviceToken: env.IFENRIR_DEVICE_TOKEN ?? null,
    timeoutMs: integer(env.IFENRIR_TIMEOUT_MS, 5000),
    mcpScopes: parseScopes(env.IFENRIR_MCP_SCOPES, 'leitura'),
    env,
  };
}

export function describeConfig(config) {
  return {
    transporte: config.transport,
    porta_serial: config.serialPort ?? 'deteccao automatica',
    baud: config.baudRate,
    endereco: `${config.host}:${config.port}`,
    tempo_limite_ms: config.timeoutMs,
    escopos_mcp: [...config.mcpScopes].join(','),
    autenticacao_http: Boolean(config.env.IFENRIR_API_TOKEN || config.env.IFENRIR_API_TOKEN_LEITURA),
  };
}
