#include "ifenrir_transporte_websocket.h"
#include "ifenrir_contrato.h"
#include "ifenrir_identidade.h"
#include "ifenrir_protocolo.h"

#include <string.h>
#include <stdio.h>

#include "esp_log.h"
#include "esp_websocket_client.h"
#include "sdkconfig.h"

static const char *ETIQUETA = "ifenrir_websocket";

static esp_websocket_client_handle_t s_cliente = NULL;
static char s_acumulador[IFENRIR_LIMITE_REQUISICAO_BYTES + 1];
static size_t s_acumulado = 0;
static char s_resposta[IFENRIR_LIMITE_RESPOSTA_BYTES];

bool ifenrir_transporte_websocket_configurado(void)
{
    return strlen(CONFIG_IFENRIR_PONTE_URL) > 0;
}

static void responder(const char *carga, size_t tamanho)
{
    size_t resposta_tamanho = ifenrir_protocolo_processar(carga, tamanho, s_resposta, sizeof(s_resposta));
    if (resposta_tamanho == 0 || s_cliente == NULL) {
        return;
    }
    if (!esp_websocket_client_is_connected(s_cliente)) {
        ESP_LOGW(ETIQUETA, "resposta descartada: sessao encerrada antes do envio");
        return;
    }
    esp_websocket_client_send_text(s_cliente, s_resposta, (int)resposta_tamanho, portMAX_DELAY);
}

static void tratar_evento(void *argumento, esp_event_base_t base, int32_t identificador, void *dados)
{
    (void)argumento;
    (void)base;

    esp_websocket_event_data_t *evento = (esp_websocket_event_data_t *)dados;

    switch (identificador) {
    case WEBSOCKET_EVENT_CONNECTED:
        s_acumulado = 0;
        ESP_LOGI(ETIQUETA, "sessao estabelecida com a ponte");
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
        s_acumulado = 0;
        ESP_LOGW(ETIQUETA, "sessao encerrada, aguardando reconexao");
        break;

    case WEBSOCKET_EVENT_ERROR:
        s_acumulado = 0;
        ESP_LOGE(ETIQUETA, "erro de transporte WebSocket");
        break;

    case WEBSOCKET_EVENT_DATA:
        if (evento->op_code != 0x01 && evento->op_code != 0x00) {
            break;
        }
        if (evento->payload_len > IFENRIR_LIMITE_REQUISICAO_BYTES) {
            s_acumulado = 0;
            size_t tamanho = ifenrir_protocolo_processar(NULL, IFENRIR_LIMITE_REQUISICAO_BYTES + 1,
                                                         s_resposta, sizeof(s_resposta));
            if (tamanho > 0 && s_cliente != NULL && esp_websocket_client_is_connected(s_cliente)) {
                esp_websocket_client_send_text(s_cliente, s_resposta, (int)tamanho, portMAX_DELAY);
            }
            break;
        }
        if (s_acumulado + evento->data_len > IFENRIR_LIMITE_REQUISICAO_BYTES) {
            s_acumulado = 0;
            ESP_LOGW(ETIQUETA, "quadro descartado por exceder o limite de recepcao");
            break;
        }
        memcpy(s_acumulador + s_acumulado, evento->data_ptr, evento->data_len);
        s_acumulado += evento->data_len;

        if (s_acumulado >= (size_t)evento->payload_len) {
            s_acumulador[s_acumulado] = '\0';
            responder(s_acumulador, s_acumulado);
            s_acumulado = 0;
        }
        break;

    default:
        break;
    }
}

esp_err_t ifenrir_transporte_websocket_iniciar(void)
{
    if (!ifenrir_transporte_websocket_configurado()) {
        ESP_LOGI(ETIQUETA, "URL da ponte nao configurada, transporte WebSocket inativo");
        return ESP_OK;
    }

    char cabecalhos[192];
    snprintf(cabecalhos, sizeof(cabecalhos),
             "X-IFenrir-Dispositivo: %s\r\nX-IFenrir-Token: %s\r\n",
             ifenrir_identidade_dispositivo(), CONFIG_IFENRIR_PONTE_TOKEN);

    esp_websocket_client_config_t configuracao = {
        .uri = CONFIG_IFENRIR_PONTE_URL,
        .headers = cabecalhos,
        .reconnect_timeout_ms = 5000,
        .network_timeout_ms = 10000,
        .buffer_size = 2048,
    };

    s_cliente = esp_websocket_client_init(&configuracao);
    if (s_cliente == NULL) {
        return ESP_FAIL;
    }

    esp_err_t resultado = esp_websocket_register_events(s_cliente, WEBSOCKET_EVENT_ANY, tratar_evento, NULL);
    if (resultado != ESP_OK) {
        return resultado;
    }

    ESP_LOGI(ETIQUETA, "conectando a ponte configurada");
    return esp_websocket_client_start(s_cliente);
}
