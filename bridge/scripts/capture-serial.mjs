import { SerialPort } from 'serialport';

const port = process.env.IFENRIR_SERIAL_PORT ?? process.argv[2];
const durationMs = Number.parseInt(process.env.IFENRIR_CAPTURE_MS ?? process.argv[3] ?? '6000', 10);
const shouldReset = process.env.IFENRIR_CAPTURE_RESET !== '0';

if (!port) {
  process.stderr.write('Uso: node scripts/capture-serial.mjs <PORTA> [MILISSEGUNDOS]\n');
  process.exit(2);
}

const serial = new SerialPort({ path: port, baudRate: 115200, autoOpen: false });

function set(signals) {
  return new Promise((resolve, reject) => {
    serial.set(signals, (error) => (error ? reject(error) : resolve()));
  });
}

serial.open(async (error) => {
  if (error) {
    process.stderr.write(`Falha ao abrir ${port}: ${error.message}\n`);
    process.exit(1);
  }

  await set({ dtr: false, rts: false });

  if (shouldReset) {
    await set({ dtr: false, rts: true });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await set({ dtr: false, rts: false });
  }

  let captured = '';
  serial.on('data', (chunk) => {
    captured += chunk.toString('utf8');
  });

  setTimeout(() => {
    process.stdout.write(captured);
    serial.close(() => process.exit(0));
  }, durationMs);
});
