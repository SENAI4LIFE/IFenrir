#include "ifenrir_rede.h"

#include <string.h>
#include <stdio.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *ETIQUETA = "ifenrir_rede";

static ifenrir_rede_estado_t s_estado = IFENRIR_REDE_DESABILITADA;
static char s_ip[16] = "0.0.0.0";
static int s_tentativas = 0;

bool ifenrir_rede_configurada(void)
{
    return strlen(CONFIG_IFENRIR_WIFI_SSID) > 0;
}

static void tratar_evento(void *argumento, esp_event_base_t base, int32_t identificador, void *dados)
{
    (void)argumento;

    if (base == WIFI_EVENT && identificador == WIFI_EVENT_STA_START) {
        s_estado = IFENRIR_REDE_CONECTANDO;
        esp_wifi_connect();
        return;
    }

    if (base == WIFI_EVENT && identificador == WIFI_EVENT_STA_DISCONNECTED) {
        strcpy(s_ip, "0.0.0.0");
        if (s_tentativas < CONFIG_IFENRIR_WIFI_TENTATIVAS) {
            s_tentativas++;
            s_estado = IFENRIR_REDE_CONECTANDO;
            vTaskDelay(pdMS_TO_TICKS(1000 * s_tentativas));
            esp_wifi_connect();
            ESP_LOGW(ETIQUETA, "reconectando ao Wi-Fi (tentativa %d)", s_tentativas);
        } else {
            s_estado = IFENRIR_REDE_FALHA;
            ESP_LOGE(ETIQUETA, "tentativas de conexao Wi-Fi esgotadas");
        }
        return;
    }

    if (base == IP_EVENT && identificador == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *evento = (ip_event_got_ip_t *)dados;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&evento->ip_info.ip));
        s_tentativas = 0;
        s_estado = IFENRIR_REDE_CONECTADA;
        ESP_LOGI(ETIQUETA, "Wi-Fi conectado, IP %s", s_ip);
    }
}

esp_err_t ifenrir_rede_iniciar(void)
{
    if (!ifenrir_rede_configurada()) {
        ESP_LOGI(ETIQUETA, "Wi-Fi nao configurado, operando somente por serial");
        s_estado = IFENRIR_REDE_DESABILITADA;
        return ESP_OK;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t configuracao = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&configuracao));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &tratar_evento, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &tratar_evento, NULL, NULL));

    wifi_config_t estacao = { 0 };
    strncpy((char *)estacao.sta.ssid, CONFIG_IFENRIR_WIFI_SSID, sizeof(estacao.sta.ssid) - 1);
    strncpy((char *)estacao.sta.password, CONFIG_IFENRIR_WIFI_SENHA, sizeof(estacao.sta.password) - 1);
    estacao.sta.threshold.authmode = strlen(CONFIG_IFENRIR_WIFI_SENHA) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &estacao));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(ETIQUETA, "Wi-Fi iniciado para o SSID configurado");
    return ESP_OK;
}

ifenrir_rede_estado_t ifenrir_rede_estado(void)
{
    return s_estado;
}

const char *ifenrir_rede_estado_texto(void)
{
    switch (s_estado) {
    case IFENRIR_REDE_DESABILITADA: return "desabilitada";
    case IFENRIR_REDE_CONECTANDO:   return "conectando";
    case IFENRIR_REDE_CONECTADA:    return "conectada";
    case IFENRIR_REDE_FALHA:        return "falha";
    default:                        return "desconhecida";
    }
}

const char *ifenrir_rede_ssid(void)
{
    return CONFIG_IFENRIR_WIFI_SSID;
}

const char *ifenrir_rede_ip(void)
{
    return s_ip;
}

bool ifenrir_rede_rssi(int8_t *rssi)
{
    if (rssi == NULL || s_estado != IFENRIR_REDE_CONECTADA) {
        return false;
    }

    wifi_ap_record_t registro;
    if (esp_wifi_sta_get_ap_info(&registro) != ESP_OK) {
        return false;
    }

    *rssi = registro.rssi;
    return true;
}
