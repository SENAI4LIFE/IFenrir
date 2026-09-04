#include "ifenrir_capacidades.h"
#include "ifenrir_contrato.h"
#include "ifenrir_identidade.h"
#include "ifenrir_rede.h"
#include "ifenrir_transporte_serial.h"
#include "ifenrir_transporte_websocket.h"

#include "esp_err.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"

static const char *ETIQUETA = "ifenrir";

static esp_err_t preparar_nvs(void)
{
    esp_err_t resultado = nvs_flash_init();
    if (resultado == ESP_ERR_NVS_NO_FREE_PAGES || resultado == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        resultado = nvs_flash_init();
    }
    return resultado;
}

void app_main(void)
{
    ESP_ERROR_CHECK(preparar_nvs());
    ESP_ERROR_CHECK(ifenrir_identidade_iniciar());

    ifenrir_capacidades_iniciar();

    ESP_LOGI(ETIQUETA, "IFenrir %s protocolo %s dispositivo %s",
             IFENRIR_FIRMWARE_VERSAO, IFENRIR_PROTOCOLO_VERSAO, ifenrir_identidade_dispositivo());
    ESP_LOGI(ETIQUETA, "capacidades declaradas: %u", (unsigned)ifenrir_capacidades_total());
    ESP_LOGI(ETIQUETA, "memoria livre inicial: %u bytes", (unsigned)esp_get_free_heap_size());

    ESP_ERROR_CHECK(ifenrir_transporte_serial_iniciar());

    if (ifenrir_rede_configurada()) {
        ESP_ERROR_CHECK(ifenrir_rede_iniciar());
        ESP_ERROR_CHECK(ifenrir_transporte_websocket_iniciar());
    } else {
        ESP_LOGI(ETIQUETA, "Wi-Fi ausente, transporte serial e o unico canal ativo");
    }

    ESP_LOGI(ETIQUETA, "IFenrir pronto");
}
