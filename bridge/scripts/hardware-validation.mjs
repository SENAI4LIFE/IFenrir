import { writeFileSync } from 'node:fs';

import { PROTOCOL_VERSION, SENTINEL } from '../src/contract.js';
import { DeviceSession } from '../src/device-session.js';
import { SerialTransport } from '../src/serial-transport.js';
import { selectPort } from '../src/device-detect.js';

const silent = { info() {}, warn() {}, error() {} };
const results = [];
const measurements = {};

function record(name, expectation, passed, observed) {
  results.push({ verificacao: name, esperado: expectation, aprovado: passed, observado: observed });
  const mark = passed ? 'OK  ' : 'FALHA';
  process.stdout.write(`  [${mark}] ${name} -> ${observed}\n`);
}

function rawSend(transport, payload, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.off('frame', onFrame);
      reject(new Error('sem resposta dentro do tempo limite'));
    }, timeoutMs);

    const onFrame = (line) => {
      clearTimeout(timer);
      transport.off('frame', onFrame);
      resolve(line);
    };

    transport.on('frame', onFrame);
    transport.port.write(`${SENTINEL}${payload}\n`, (error) => {
      if (error) {
        clearTimeout(timer);
        transport.off('frame', onFrame);
        reject(error);
      }
    });
  });
}

async function expectRawError(transport, name, payload, expectedCode) {
  try {
    const raw = await rawSend(transport, payload);
    const parsed = JSON.parse(raw);
    const code = parsed.erro?.codigo;
    record(name, expectedCode, code === expectedCode, `codigo=${code}`);
  } catch (error) {
    record(name, expectedCode, false, `excecao: ${error.message}`);
  }
}

async function main() {
  const selected = await selectPort(process.env.IFENRIR_SERIAL_PORT ?? null);
  process.stdout.write(`IFenrir: validacao de hardware em ${selected.caminho} (${selected.ponte})\n\n`);

  const transport = new SerialTransport({ path: selected.caminho, baudRate: 115200, logger: silent });
  const session = new DeviceSession(transport, silent, { timeoutMs: 5000 });
  await session.open();
  await new Promise((resolve) => setTimeout(resolve, 400));

  process.stdout.write('Capacidades de leitura no dispositivo real:\n');

  const info = await session.invoke('obter_informacoes_dispositivo', {});
  record(
    'obter_informacoes_dispositivo',
    'sucesso com SoC e versao de firmware',
    info.sucesso && info.resultado.soc === 'ESP32',
    `soc=${info.resultado?.soc} firmware=${info.resultado?.firmware} idf=${info.resultado?.esp_idf}`,
  );
  measurements.dispositivo = info.resultado;

  const estado = await session.invoke('obter_estado', {});
  record(
    'obter_estado',
    'sucesso com memoria e tempo de atividade',
    estado.sucesso && typeof estado.resultado.memoria_livre_bytes === 'number',
    `heap=${estado.resultado?.memoria_livre_bytes} uptime=${estado.resultado?.tempo_atividade_ms}ms`,
  );

  const memoriaMinima = await session.invoke('obter_memoria_minima', {});
  record(
    'obter_memoria_minima',
    'sucesso',
    memoriaMinima.sucesso,
    `min=${memoriaMinima.resultado?.memoria_minima_bytes}`,
  );
  measurements.memoria = {
    livre_bytes: estado.resultado?.memoria_livre_bytes,
    minima_bytes: memoriaMinima.resultado?.memoria_minima_bytes,
  };

  const reinicio = await session.invoke('obter_motivo_reinicio', {});
  record('obter_motivo_reinicio', 'sucesso', reinicio.sucesso, `motivo=${reinicio.resultado?.motivo_reinicio}`);

  const wifi = await session.invoke('obter_estado_wifi', {});
  record('obter_estado_wifi', 'sucesso', wifi.sucesso, `estado=${wifi.resultado?.estado}`);

  const rssi = await session.invoke('obter_rssi_wifi', {});
  record(
    'obter_rssi_wifi sem Wi-Fi provisionado',
    'FALHA_INTERNA com mensagem explicita',
    !rssi.sucesso && rssi.erro.codigo === 'FALHA_INTERNA',
    `codigo=${rssi.erro?.codigo}`,
  );

  process.stdout.write('\nValidacao de argumentos e allowlist:\n');

  const eco = await session.invoke('ecoar', { texto: 'ifenrir-hardware' });
  record('ecoar com argumento valido', 'eco identico', eco.sucesso && eco.resultado.texto === 'ifenrir-hardware', `texto=${eco.resultado?.texto}`);

  const ecoInvalido = await session.invoke('ecoar', { texto: 12345 });
  record(
    'ecoar com argumento de tipo errado',
    'ARGUMENTO_INVALIDO',
    !ecoInvalido.sucesso && ecoInvalido.erro.codigo === 'ARGUMENTO_INVALIDO',
    `codigo=${ecoInvalido.erro?.codigo}`,
  );

  const ecoLongo = await session.invoke('ecoar', { texto: 'z'.repeat(200) });
  record(
    'ecoar acima do limite de caracteres',
    'ARGUMENTO_INVALIDO',
    !ecoLongo.sucesso && ecoLongo.erro.codigo === 'ARGUMENTO_INVALIDO',
    `codigo=${ecoLongo.erro?.codigo}`,
  );

  const led = await session.invoke('definir_led', { ligado: true });
  record(
    'definir_led com atuador desabilitado',
    'CAPACIDADE_NAO_PERMITIDA',
    !led.sucesso && led.erro.codigo === 'CAPACIDADE_NAO_PERMITIDA',
    `codigo=${led.erro?.codigo}`,
  );

  const rotulo = `bancada-${Date.now().toString().slice(-6)}`;
  const escrita = await session.invoke('definir_rotulo', { rotulo });
  record(
    'definir_rotulo grava em NVS',
    'sucesso e persistencia',
    escrita.sucesso && escrita.resultado.rotulo === rotulo,
    `rotulo=${escrita.resultado?.rotulo}`,
  );

  const confirmacao = await session.invoke('obter_estado', {});
  record(
    'rotulo persistido visivel em obter_estado',
    rotulo,
    confirmacao.resultado?.rotulo === rotulo,
    `rotulo=${confirmacao.resultado?.rotulo}`,
  );

  const rotuloVazio = await session.invoke('definir_rotulo', { rotulo: '' });
  record(
    'definir_rotulo com string vazia',
    'ARGUMENTO_INVALIDO',
    !rotuloVazio.sucesso && rotuloVazio.erro.codigo === 'ARGUMENTO_INVALIDO',
    `codigo=${rotuloVazio.erro?.codigo}`,
  );

  process.stdout.write('\nMensagens invalidas enviadas diretamente ao firmware:\n');

  await expectRawError(transport, 'JSON malformado', '{isto nao e json', 'MENSAGEM_MALFORMADA');
  await expectRawError(
    transport,
    'versao de protocolo divergente',
    JSON.stringify({ protocolo: 'ifenrir/999', id: 'v1', capacidade: 'obter_estado' }),
    'PROTOCOLO_INVALIDO',
  );
  await expectRawError(
    transport,
    'campo id ausente',
    JSON.stringify({ protocolo: PROTOCOL_VERSION, capacidade: 'obter_estado' }),
    'CAMPO_OBRIGATORIO_AUSENTE',
  );
  await expectRawError(
    transport,
    'campo capacidade ausente',
    JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'v2' }),
    'CAMPO_OBRIGATORIO_AUSENTE',
  );
  await expectRawError(
    transport,
    'capacidade desconhecida',
    JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'v3', capacidade: 'executar_shell' }),
    'CAPACIDADE_DESCONHECIDA',
  );
  await expectRawError(
    transport,
    'campo argumentos com tipo errado',
    JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'v4', capacidade: 'obter_estado', argumentos: 'texto' }),
    'ARGUMENTO_INVALIDO',
  );
  await expectRawError(
    transport,
    'mensagem acima do limite de bytes',
    JSON.stringify({ protocolo: PROTOCOL_VERSION, id: 'v5', capacidade: 'ecoar', argumentos: { texto: 'y'.repeat(1200) } }),
    'MENSAGEM_EXCEDE_LIMITE',
  );

  process.stdout.write('\nRepeticao e estabilidade:\n');

  const amostras = [];
  for (let indice = 0; indice < 30; indice++) {
    const inicio = process.hrtime.bigint();
    const resposta = await session.invoke('obter_tempo_atividade', {});
    const decorrido = Number(process.hrtime.bigint() - inicio) / 1e6;
    if (!resposta.sucesso) {
      break;
    }
    amostras.push({ pontaAPonta: decorrido, dispositivo: resposta.ms });
  }

  const ordenadas = amostras.map((item) => item.pontaAPonta).sort((a, b) => a - b);
  const media = ordenadas.reduce((soma, valor) => soma + valor, 0) / ordenadas.length;

  measurements.latencia = {
    amostras: ordenadas.length,
    media_ms: Number(media.toFixed(2)),
    minimo_ms: Number(ordenadas[0].toFixed(2)),
    mediana_ms: Number(ordenadas[Math.floor(ordenadas.length / 2)].toFixed(2)),
    maximo_ms: Number(ordenadas[ordenadas.length - 1].toFixed(2)),
    processamento_dispositivo_ms: amostras.map((item) => item.dispositivo),
  };

  record(
    '30 invocacoes repetidas',
    '30 respostas corretas e correlacionadas',
    amostras.length === 30,
    `amostras=${amostras.length} media=${measurements.latencia.media_ms}ms mediana=${measurements.latencia.mediana_ms}ms`,
  );

  const depois = await session.invoke('obter_memoria_minima', {});
  const vazamento = measurements.memoria.minima_bytes - depois.resultado.memoria_minima_bytes;
  record(
    'memoria minima estavel apos a carga',
    'sem queda relevante do heap minimo',
    Math.abs(vazamento) < 8192,
    `variacao=${vazamento} bytes`,
  );
  measurements.memoria.minima_bytes_final = depois.resultado.memoria_minima_bytes;

  await session.close();

  process.stdout.write('\nReconexao do transporte serial:\n');
  const inicioReconexao = process.hrtime.bigint();
  const transporte2 = new SerialTransport({ path: selected.caminho, baudRate: 115200, logger: silent });
  const sessao2 = new DeviceSession(transporte2, silent, { timeoutMs: 5000 });
  await sessao2.open();
  const aposReconexao = await sessao2.invoke('obter_tempo_atividade', {});
  const tempoReconexao = Number(process.hrtime.bigint() - inicioReconexao) / 1e6;

  record(
    'reabertura da sessao serial',
    'dispositivo responde novamente sem reflash',
    aposReconexao.sucesso,
    `tempo=${tempoReconexao.toFixed(0)}ms uptime=${aposReconexao.resultado?.tempo_atividade_ms}ms`,
  );
  measurements.reconexao_ms = Number(tempoReconexao.toFixed(0));

  await sessao2.close();

  const aprovados = results.filter((item) => item.aprovado).length;
  const relatorio = {
    gerado_em: new Date().toISOString(),
    porta: selected.caminho,
    ponte_usb: selected.ponte,
    total: results.length,
    aprovados,
    reprovados: results.length - aprovados,
    verificacoes: results,
    medicoes: measurements,
  };

  writeFileSync(new URL('../../docs/validacao-hardware.json', import.meta.url), `${JSON.stringify(relatorio, null, 2)}\n`);

  process.stdout.write(`\nResumo: ${aprovados}/${results.length} verificacoes aprovadas.\n`);
  process.stdout.write('Relatorio salvo em docs/validacao-hardware.json\n');

  process.exit(aprovados === results.length ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`Falha na validacao de hardware: ${error.message}\n`);
  process.exit(1);
});
