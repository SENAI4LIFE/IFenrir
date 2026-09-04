import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { LIMITS, capabilitiesForScopes } from './contract.js';
import { ProtocolError } from './protocol.js';

const ARGUMENT_SCHEMAS = {
  ecoar: {
    texto: z
      .string()
      .min(1)
      .max(LIMITS.caracteresTextoEco)
      .describe('Texto a ser devolvido pelo dispositivo.'),
  },
  definir_rotulo: {
    rotulo: z
      .string()
      .min(1)
      .max(LIMITS.caracteresRotulo)
      .describe('Rotulo operacional a ser gravado em NVS.'),
  },
  definir_led: {
    ligado: z.boolean().describe('Estado desejado do LED.'),
  },
};

function toContent(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function createMcpServer({ session, logger, scopes }) {
  const server = new McpServer({
    name: 'ifenrir',
    version: '0.1.0',
  });

  const exposed = capabilitiesForScopes(scopes);

  for (const capability of exposed) {
    const schema = ARGUMENT_SCHEMAS[capability.nome] ?? {};

    server.tool(
      capability.nome,
      `${capability.resumo} Executado no ESP32 IFenrir fisico via ponte.`,
      schema,
      async (args) => {
        try {
          const response = await session.invoke(capability.nome, args ?? {}, { origem: 'mcp' });

          if (!response.sucesso) {
            return {
              ...toContent({
                sucesso: false,
                capacidade: capability.nome,
                erro: response.erro,
              }),
              isError: true,
            };
          }

          return toContent({
            sucesso: true,
            capacidade: capability.nome,
            resultado: response.resultado,
            latencia_dispositivo_ms: response.ms,
            latencia_ponte_ms: response.msPonte,
          });
        } catch (error) {
          const code = error instanceof ProtocolError ? error.code : 'FALHA_INTERNA';
          logger.error('mcp_erro', { capacidade: capability.nome, codigo: code });
          return {
            ...toContent({
              sucesso: false,
              capacidade: capability.nome,
              erro: { codigo: code, mensagem: error.message },
            }),
            isError: true,
          };
        }
      },
    );
  }

  logger.info('mcp_pronto', {
    ferramentas: exposed.map((item) => item.nome),
    escopos: [...scopes],
  });

  return {
    server,
    exposed,
    async connectStdio() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
