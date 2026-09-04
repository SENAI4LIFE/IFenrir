#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

typedef enum {
    IFENRIR_REDE_DESABILITADA = 0,
    IFENRIR_REDE_CONECTANDO,
    IFENRIR_REDE_CONECTADA,
    IFENRIR_REDE_FALHA
} ifenrir_rede_estado_t;

esp_err_t ifenrir_rede_iniciar(void);
bool ifenrir_rede_configurada(void);
ifenrir_rede_estado_t ifenrir_rede_estado(void);
const char *ifenrir_rede_estado_texto(void);
const char *ifenrir_rede_ssid(void);
const char *ifenrir_rede_ip(void);
bool ifenrir_rede_rssi(int8_t *rssi);
