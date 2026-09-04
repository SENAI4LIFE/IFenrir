# Validação experimental

Este documento reúne as evidências experimentais do IFenrir. O README descreve a plataforma e a
arquitetura de forma reutilizável; aqui ficam os resultados medidos, que dependem do ambiente
em que a suíte foi executada.

## Ambiente de referência

As medições desta página foram obtidas com a seguinte configuração. Outros alvos compatíveis
produzem valores diferentes.

| Item | Valor |
| --- | --- |
| SoC | ESP32-D0WD-V3, revisão v3.1, 2 núcleos, Xtensa LX6 |
| Flash / PSRAM | 4 MB / ausente |
| Ponte USB-serial | CH340 (`1A86:7523`) |
| Transporte | serial, 115200 bauds, ponte no mesmo host |
| ESP-IDF | v5.5.5 |
| Node.js | 24.18.0 |
| OpenClaw | 2026.9.1 |

## Medições

| Métrica | Valor |
| --- | --- |
| Binário do firmware | 234.640 B (85% da partição de aplicação livre) |
| Heap livre na inicialização | 287.004 B |
| Heap mínimo observado | 276.360 B |
| Variação do heap após 30 invocações | 0 B |
| Latência ponta a ponta (n=30) | média 49,3 ms, mediana 49,3 ms, mín. 49,2 ms, máx. 49,6 ms |
| Processamento no dispositivo | 2 ms em todas as amostras |
| Reabertura da sessão serial | 63 ms |

A diferença entre 2 ms no dispositivo e cerca de 49 ms ponta a ponta vem do transporte
USB-serial e do agendamento do host, não do firmware. Amostra pequena e ambiente único: os
valores são descritivos e não sustentam inferência estatística.

Relatórios gerados pelas suítes: [`validacao-hardware.json`](validacao-hardware.json) e
[`validacao-mcp.json`](validacao-mcp.json).

## Cobertura por objetivo técnico

Estados usados: `Validado`, `Preparado, pendente de ação externa`, `Não validado / bloqueado`.

| Objetivo | Verificação | Estado |
| --- | --- | --- |
| Exposição e descoberta de capacidades | `listar_capacidades` no dispositivo; testes Unity | Validado |
| Invocação estruturada em JSON | Verificações em hardware e Unity | Validado |
| Validação de comandos e mensagens inválidas | Sete classes de mensagem inválida no firmware real | Validado |
| Autenticação e permissões | Testes HTTP e MCP por escopo | Validado |
| Rastreabilidade | Logs correlacionados por `id`, com redação de segredos | Validado |
| Robustez e reconexão | Queda de transporte, tempo limite, rajada inválida, reabertura de sessão | Validado |
| Limitações de memória e latência | Ver [medições](#medições) | Validado |
| Integração OpenClaw | `openclaw mcp add` e `openclaw mcp probe` reportando dez ferramentas | Validado |
| Ferramentas MCP sobre o ESP32 real | Cliente MCP oficial → ponte → dispositivo | Validado |
| Interface e responsividade | Playwright em Chromium, Firefox e WebKit, de 320 a 1920 px | Validado |
| Wi-Fi e transporte WebSocket | Requerem credenciais de rede do operador | Preparado, pendente de ação externa |
| Demonstração em celular | Requer aparelho na mesma rede | Preparado, pendente de ação externa |
| Agente de IA em linguagem natural | Requer provedor de LLM configurado no OpenClaw | Preparado, pendente de ação externa |
| Execução do ESP-Claw no alvo `esp32` | Requisitos de flash e PSRAM não atendidos pelo SoC de referência | Não validado / bloqueado |
| Invocação MCP pelo Gateway HTTP | O Gateway instancia servidores MCP por sessão de agente | Não validado / bloqueado |

## Dimensão das suítes

| Suíte | Testes | Hardware |
| --- | --- | --- |
| Ponte (unidade, protocolo, integração, MCP) | 54 | não |
| Interface e responsividade (Chromium, Firefox, WebKit) | 134 | não |
| Unity no dispositivo | 37 | sim |
| Validação em hardware | 23 verificações | sim |
| Caminho MCP sobre o dispositivo | 7 verificações | sim |

## Observações

O ESP-Claw expõe capacidades nativamente por MCP (`cap_mcp_server`, `cap_mcp_client`) e traz a
aplicação de referência `mcp_server_point`. Em um alvo que atenda aos requisitos de flash e
PSRAM, parte da ponte do IFenrir seria dispensável. No alvo `esp32` clássico, que não atende a
esses requisitos, o IFenrir demonstra o mesmo modelo de exposição de capacidades por uma
camada externa.
