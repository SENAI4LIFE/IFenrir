#pragma once

#include <stddef.h>

#include "ifenrir_contrato.h"

size_t ifenrir_protocolo_processar(const char *entrada,
                                   size_t entrada_tamanho,
                                   char *saida,
                                   size_t saida_tamanho);
