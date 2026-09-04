#pragma once

#include "esp_err.h"

#define IFENRIR_FIRMWARE_VERSAO "0.1.0"

esp_err_t ifenrir_identidade_iniciar(void);
const char *ifenrir_identidade_dispositivo(void);
const char *ifenrir_identidade_mac(void);
const char *ifenrir_identidade_rotulo(void);
esp_err_t ifenrir_identidade_definir_rotulo(const char *rotulo);
