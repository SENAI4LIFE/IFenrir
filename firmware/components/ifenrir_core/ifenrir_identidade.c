#include "ifenrir_identidade.h"
#include "ifenrir_contrato.h"

#include <string.h>
#include <stdio.h>

#include "esp_mac.h"
#include "nvs.h"
#include "nvs_flash.h"

#define IFENRIR_NVS_ESPACO "ifenrir"
#define IFENRIR_NVS_CHAVE_ROTULO "rotulo"

static char s_dispositivo[24];
static char s_mac[18];
static char s_rotulo[IFENRIR_LIMITE_ROTULO + 1];

static void carregar_rotulo(void)
{
    nvs_handle_t manipulador;
    strcpy(s_rotulo, "sem-rotulo");

    if (nvs_open(IFENRIR_NVS_ESPACO, NVS_READONLY, &manipulador) != ESP_OK) {
        return;
    }

    size_t tamanho = sizeof(s_rotulo);
    char valor[IFENRIR_LIMITE_ROTULO + 1];
    if (nvs_get_str(manipulador, IFENRIR_NVS_CHAVE_ROTULO, valor, &tamanho) == ESP_OK) {
        strncpy(s_rotulo, valor, IFENRIR_LIMITE_ROTULO);
        s_rotulo[IFENRIR_LIMITE_ROTULO] = '\0';
    }
    nvs_close(manipulador);
}

esp_err_t ifenrir_identidade_iniciar(void)
{
    uint8_t mac[6];
    esp_err_t resultado = esp_read_mac(mac, ESP_MAC_WIFI_STA);
    if (resultado != ESP_OK) {
        return resultado;
    }

    snprintf(s_mac, sizeof(s_mac), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    snprintf(s_dispositivo, sizeof(s_dispositivo), "ifenrir-%02x%02x%02x", mac[3], mac[4], mac[5]);

    carregar_rotulo();
    return ESP_OK;
}

const char *ifenrir_identidade_dispositivo(void)
{
    return s_dispositivo;
}

const char *ifenrir_identidade_mac(void)
{
    return s_mac;
}

const char *ifenrir_identidade_rotulo(void)
{
    return s_rotulo;
}

esp_err_t ifenrir_identidade_definir_rotulo(const char *rotulo)
{
    if (rotulo == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t comprimento = strlen(rotulo);
    if (comprimento == 0 || comprimento > IFENRIR_LIMITE_ROTULO) {
        return ESP_ERR_INVALID_SIZE;
    }

    nvs_handle_t manipulador;
    esp_err_t resultado = nvs_open(IFENRIR_NVS_ESPACO, NVS_READWRITE, &manipulador);
    if (resultado != ESP_OK) {
        return resultado;
    }

    resultado = nvs_set_str(manipulador, IFENRIR_NVS_CHAVE_ROTULO, rotulo);
    if (resultado == ESP_OK) {
        resultado = nvs_commit(manipulador);
    }
    nvs_close(manipulador);

    if (resultado == ESP_OK) {
        strncpy(s_rotulo, rotulo, IFENRIR_LIMITE_ROTULO);
        s_rotulo[IFENRIR_LIMITE_ROTULO] = '\0';
    }
    return resultado;
}
