import { SerialPort } from 'serialport';

const USB_SERIAL_BRIDGES = new Map([
  ['1a86', 'WCH CH340/CH341'],
  ['10c4', 'Silicon Labs CP210x'],
  ['0403', 'FTDI'],
  ['303a', 'Espressif USB-Serial-JTAG'],
]);

function normalizeId(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^0x/, '') : null;
}

export async function listCandidates() {
  const ports = await SerialPort.list();

  return ports.map((port) => {
    const vendorId = normalizeId(port.vendorId);
    const bridge = vendorId ? USB_SERIAL_BRIDGES.get(vendorId) : null;
    const isBluetooth = /bluetooth/i.test(port.friendlyName ?? port.pnpId ?? '');

    return {
      caminho: port.path,
      fabricante: port.manufacturer ?? null,
      descricao: port.friendlyName ?? null,
      vendorId: vendorId ?? null,
      productId: normalizeId(port.productId),
      ponte: bridge,
      provavel: Boolean(bridge) && !isBluetooth,
    };
  });
}

export async function selectPort(requested) {
  const candidates = await listCandidates();

  if (requested) {
    const match = candidates.find((item) => item.caminho.toLowerCase() === requested.toLowerCase());
    if (!match) {
      throw new Error(
        `porta ${requested} nao foi encontrada. Portas disponiveis: ${candidates.map((c) => c.caminho).join(', ') || 'nenhuma'}`,
      );
    }
    return match;
  }

  const likely = candidates.filter((item) => item.provavel);
  if (likely.length === 0) {
    throw new Error(
      'nenhuma interface USB-serial compativel foi detectada. Conecte o ESP32 e informe a porta com IFENRIR_SERIAL_PORT.',
    );
  }
  if (likely.length > 1) {
    throw new Error(
      `mais de uma interface compativel foi detectada (${likely
        .map((item) => item.caminho)
        .join(', ')}). Informe a porta desejada com IFENRIR_SERIAL_PORT.`,
    );
  }

  return likely[0];
}
