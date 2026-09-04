#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "cJSON.h"
#include "ifenrir_contrato.h"

typedef ifenrir_codigo_t (*ifenrir_executor_t)(const cJSON *argumentos,
                                               cJSON *resultado,
                                               char *detalhe,
                                               size_t detalhe_tamanho);

typedef struct {
    const char *nome;
    const char *tipo;
    const char *resumo;
    bool permitida;
    ifenrir_executor_t executar;
} ifenrir_capacidade_t;

void ifenrir_capacidades_iniciar(void);
size_t ifenrir_capacidades_total(void);
const ifenrir_capacidade_t *ifenrir_capacidades_indice(size_t indice);
const ifenrir_capacidade_t *ifenrir_capacidades_buscar(const char *nome);
