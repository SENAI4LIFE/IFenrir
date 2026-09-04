const REDACTED = '[oculto]';
const SENSITIVE = /token|senha|password|secret|apikey|api_key|authorization/i;

function sanitize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE.test(key) ? REDACTED : sanitize(entry);
  }
  return output;
}

export function createLogger(stream = process.stderr) {
  const write = (level, event, fields) => {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...sanitize(fields ?? {}),
    };
    stream.write(`${JSON.stringify(record)}\n`);
  };

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

export const trailKeys = ['id', 'origem', 'capacidade', 'resultado', 'codigo', 'ms'];
