import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(here, '..');

const results = [];

function record(name, expectation, passed, observed) {
  results.push({ verificacao: name, esperado: expectation, aprovado: passed, observado: observed });
  process.stdout.write(`  [${passed ? 'OK  ' : 'FALHA'}] ${name} -> ${observed}\n`);
}

async function main() {
  const serialPort = process.env.IFENRIR_SERIAL_PORT;
  if (!serialPort) {
    process.stderr.write('Defina IFENRIR_SERIAL_PORT antes de executar a validacao MCP.\n');
    process.exit(2);
  }

  process.stdout.write('IFenrir: validacao MCP ponta a ponta contra o ESP32 fisico\n\n');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(bridgeRoot, 'src', 'cli.js'), 'mcp'],
    cwd: bridgeRoot,
    env: { ...process.env, IFENRIR_SERIAL_PORT: serialPort },
    stderr: 'ignore',
  });

  const client = new Client({ name: 'ifenrir-validacao', version: '0.1.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const nomes = tools.map((item) => item.name).sort();

  record(
    'handshake MCP e descoberta de ferramentas',
    'servidor responde e declara ferramentas',
    tools.length > 0,
    `ferramentas=${tools.length}`,
  );

  record(
    'escopo padrao expoe somente leitura',
    'nenhuma ferramenta de escrita no escopo padrao',
    !nomes.includes('definir_rotulo') && !nomes.includes('definir_led'),
    nomes.join(', '),
  );

  const estado = await client.callTool({ name: 'obter_estado', arguments: {} });
  const carga = JSON.parse(estado.content[0].text);
  record(
    'obter_estado executado no ESP32 real via MCP',
    'sucesso com heap e tempo de atividade do dispositivo',
    carga.sucesso === true && typeof carga.resultado.memoria_livre_bytes === 'number',
    `heap=${carga.resultado?.memoria_livre_bytes} uptime=${carga.resultado?.tempo_atividade_ms}ms latencia=${carga.latencia_ponte_ms}ms`,
  );

  const info = await client.callTool({ name: 'obter_informacoes_dispositivo', arguments: {} });
  const cargaInfo = JSON.parse(info.content[0].text);
  record(
    'obter_informacoes_dispositivo via MCP',
    'SoC ESP32 e identidade do firmware',
    cargaInfo.resultado?.soc === 'ESP32',
    `soc=${cargaInfo.resultado?.soc} mac=${cargaInfo.resultado?.mac} idf=${cargaInfo.resultado?.esp_idf}`,
  );

  const eco = await client.callTool({ name: 'ecoar', arguments: { texto: 'validacao-mcp' } });
  const cargaEco = JSON.parse(eco.content[0].text);
  record(
    'ecoar com argumento valido via MCP',
    'texto devolvido pelo dispositivo',
    cargaEco.resultado?.texto === 'validacao-mcp',
    `texto=${cargaEco.resultado?.texto}`,
  );

  const ecoInvalido = await client.callTool({ name: 'ecoar', arguments: { texto: '' } });
  record(
    'ecoar com argumento invalido via MCP',
    'recusado antes de alcancar o dispositivo',
    ecoInvalido.isError === true,
    'isError=true',
  );

  let bloqueado = false;
  try {
    const proibida = await client.callTool({ name: 'definir_rotulo', arguments: { rotulo: 'x' } });
    bloqueado = proibida.isError === true;
  } catch {
    bloqueado = true;
  }
  record(
    'ferramenta de escrita fora do escopo padrao',
    'invocacao recusada',
    bloqueado,
    'recusada',
  );

  await client.close();

  const aprovados = results.filter((item) => item.aprovado).length;
  const relatorio = {
    gerado_em: new Date().toISOString(),
    porta: serialPort,
    ferramentas_descobertas: nomes,
    total: results.length,
    aprovados,
    reprovados: results.length - aprovados,
    verificacoes: results,
  };

  writeFileSync(join(bridgeRoot, '..', 'docs', 'validacao-mcp.json'), `${JSON.stringify(relatorio, null, 2)}\n`);

  process.stdout.write(`\nResumo: ${aprovados}/${results.length} verificacoes aprovadas.\n`);
  process.stdout.write('Relatorio salvo em docs/validacao-mcp.json\n');
  process.exit(aprovados === results.length ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`Falha na validacao MCP: ${error.message}\n`);
  process.exit(1);
});
