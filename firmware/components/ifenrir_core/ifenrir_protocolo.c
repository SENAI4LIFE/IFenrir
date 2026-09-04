#include "ifenrir_protocolo.h"
#include "ifenrir_capacidades.h"

#include <string.h>
#include <stdio.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"

static const char *ETIQUETA = "ifenrir_protocolo";
static const char *ID_AUSENTE = "sem-id";

const char *ifenrir_codigo_texto(ifenrir_codigo_t codigo)
{
    switch (codigo) {
    case IFENRIR_OK:                              return "OK";
    case IFENRIR_ERRO_PROTOCOLO_INVALIDO:         return "PROTOCOLO_INVALIDO";
    case IFENRIR_ERRO_MENSAGEM_MALFORMADA:        return "MENSAGEM_MALFORMADA";
    case IFENRIR_ERRO_MENSAGEM_EXCEDE_LIMITE:     return "MENSAGEM_EXCEDE_LIMITE";
    case IFENRIR_ERRO_CAMPO_OBRIGATORIO_AUSENTE:  return "CAMPO_OBRIGATORIO_AUSENTE";
    case IFENRIR_ERRO_CAPACIDADE_DESCONHECIDA:    return "CAPACIDADE_DESCONHECIDA";
    case IFENRIR_ERRO_CAPACIDADE_NAO_PERMITIDA:   return "CAPACIDADE_NAO_PERMITIDA";
    case IFENRIR_ERRO_ARGUMENTO_INVALIDO:         return "ARGUMENTO_INVALIDO";
    case IFENRIR_ERRO_FALHA_INTERNA:              return "FALHA_INTERNA";
    default:                                      return "FALHA_INTERNA";
    }
}

static size_t escrever(char *saida, size_t saida_tamanho, cJSON *documento)
{
    char *texto = cJSON_PrintUnformatted(documento);
    if (texto == NULL) {
        int escritos = snprintf(saida, saida_tamanho,
                                "{\"protocolo\":\"%s\",\"id\":\"%s\",\"sucesso\":false,"
                                "\"erro\":{\"codigo\":\"FALHA_INTERNA\",\"mensagem\":\"falha ao serializar a resposta\"}}",
                                IFENRIR_PROTOCOLO_VERSAO, ID_AUSENTE);
        return escritos > 0 ? (size_t)escritos : 0;
    }

    size_t comprimento = strlen(texto);
    if (comprimento >= saida_tamanho) {
        cJSON_free(texto);
        int escritos = snprintf(saida, saida_tamanho,
                                "{\"protocolo\":\"%s\",\"id\":\"%s\",\"sucesso\":false,"
                                "\"erro\":{\"codigo\":\"MENSAGEM_EXCEDE_LIMITE\",\"mensagem\":\"resposta excede o limite do transporte\"}}",
                                IFENRIR_PROTOCOLO_VERSAO, ID_AUSENTE);
        return escritos > 0 ? (size_t)escritos : 0;
    }

    memcpy(saida, texto, comprimento);
    saida[comprimento] = '\0';
    cJSON_free(texto);
    return comprimento;
}

static size_t responder_erro(char *saida, size_t saida_tamanho, const char *identificador,
                             ifenrir_codigo_t codigo, const char *detalhe, int64_t inicio_us)
{
    cJSON *documento = cJSON_CreateObject();
    if (documento == NULL) {
        return 0;
    }

    cJSON_AddStringToObject(documento, "protocolo", IFENRIR_PROTOCOLO_VERSAO);
    cJSON_AddStringToObject(documento, "id", identificador != NULL ? identificador : ID_AUSENTE);
    cJSON_AddBoolToObject(documento, "sucesso", false);

    cJSON *erro = cJSON_AddObjectToObject(documento, "erro");
    if (erro != NULL) {
        cJSON_AddStringToObject(erro, "codigo", ifenrir_codigo_texto(codigo));
        cJSON_AddStringToObject(erro, "mensagem", detalhe != NULL && detalhe[0] != '\0'
                                                       ? detalhe
                                                       : ifenrir_codigo_texto(codigo));
    }
    cJSON_AddNumberToObject(documento, "ms", (double)((esp_timer_get_time() - inicio_us) / 1000));

    size_t comprimento = escrever(saida, saida_tamanho, documento);
    cJSON_Delete(documento);

    ESP_LOGW(ETIQUETA, "id=%s resultado=erro codigo=%s",
             identificador != NULL ? identificador : ID_AUSENTE,
             ifenrir_codigo_texto(codigo));
    return comprimento;
}

size_t ifenrir_protocolo_processar(const char *entrada, size_t entrada_tamanho,
                                   char *saida, size_t saida_tamanho)
{
    int64_t inicio_us = esp_timer_get_time();

    if (saida == NULL || saida_tamanho == 0) {
        return 0;
    }
    if (entrada_tamanho > IFENRIR_LIMITE_REQUISICAO_BYTES) {
        return responder_erro(saida, saida_tamanho, NULL, IFENRIR_ERRO_MENSAGEM_EXCEDE_LIMITE,
                              "requisicao excede o limite de bytes", inicio_us);
    }
    if (entrada == NULL || entrada_tamanho == 0) {
        return responder_erro(saida, saida_tamanho, NULL, IFENRIR_ERRO_MENSAGEM_MALFORMADA,
                              "requisicao vazia", inicio_us);
    }

    cJSON *requisicao = cJSON_ParseWithLength(entrada, entrada_tamanho);
    if (requisicao == NULL) {
        return responder_erro(saida, saida_tamanho, NULL, IFENRIR_ERRO_MENSAGEM_MALFORMADA,
                              "JSON invalido", inicio_us);
    }

    const cJSON *identificador = cJSON_GetObjectItemCaseSensitive(requisicao, "id");
    const char *id_texto = ID_AUSENTE;
    if (cJSON_IsString(identificador) && identificador->valuestring != NULL &&
        identificador->valuestring[0] != '\0' &&
        strlen(identificador->valuestring) <= IFENRIR_LIMITE_ID_CARACTERES) {
        id_texto = identificador->valuestring;
    } else {
        size_t comprimento = responder_erro(saida, saida_tamanho, NULL,
                                            IFENRIR_ERRO_CAMPO_OBRIGATORIO_AUSENTE,
                                            "campo id ausente ou invalido", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    const cJSON *versao = cJSON_GetObjectItemCaseSensitive(requisicao, "protocolo");
    if (!cJSON_IsString(versao) || versao->valuestring == NULL ||
        strcmp(versao->valuestring, IFENRIR_PROTOCOLO_VERSAO) != 0) {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_PROTOCOLO_INVALIDO,
                                            "versao de protocolo nao suportada", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    const cJSON *nome = cJSON_GetObjectItemCaseSensitive(requisicao, "capacidade");
    if (!cJSON_IsString(nome) || nome->valuestring == NULL || nome->valuestring[0] == '\0') {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_CAMPO_OBRIGATORIO_AUSENTE,
                                            "campo capacidade ausente ou invalido", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    const ifenrir_capacidade_t *capacidade = ifenrir_capacidades_buscar(nome->valuestring);
    if (capacidade == NULL) {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_CAPACIDADE_DESCONHECIDA,
                                            "capacidade nao declarada por este firmware", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    if (!capacidade->permitida) {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_CAPACIDADE_NAO_PERMITIDA,
                                            "capacidade declarada porem nao permitida", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    const cJSON *argumentos = cJSON_GetObjectItemCaseSensitive(requisicao, "argumentos");
    if (argumentos != NULL && !cJSON_IsObject(argumentos)) {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_ARGUMENTO_INVALIDO,
                                            "campo argumentos deve ser um objeto", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    ESP_LOGI(ETIQUETA, "id=%s capacidade=%s inicio", id_texto, capacidade->nome);

    cJSON *resultado = cJSON_CreateObject();
    if (resultado == NULL) {
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_FALHA_INTERNA,
                                            "sem memoria para montar o resultado", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    char detalhe[IFENRIR_LIMITE_DETALHE];
    detalhe[0] = '\0';

    ifenrir_codigo_t codigo = capacidade->executar(argumentos, resultado, detalhe, sizeof(detalhe));

    if (codigo != IFENRIR_OK) {
        cJSON_Delete(resultado);
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto, codigo, detalhe, inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    cJSON *documento = cJSON_CreateObject();
    if (documento == NULL) {
        cJSON_Delete(resultado);
        size_t comprimento = responder_erro(saida, saida_tamanho, id_texto,
                                            IFENRIR_ERRO_FALHA_INTERNA,
                                            "sem memoria para montar a resposta", inicio_us);
        cJSON_Delete(requisicao);
        return comprimento;
    }

    cJSON_AddStringToObject(documento, "protocolo", IFENRIR_PROTOCOLO_VERSAO);
    cJSON_AddStringToObject(documento, "id", id_texto);
    cJSON_AddBoolToObject(documento, "sucesso", true);
    cJSON_AddStringToObject(documento, "capacidade", capacidade->nome);
    cJSON_AddItemToObject(documento, "resultado", resultado);
    cJSON_AddNumberToObject(documento, "ms", (double)((esp_timer_get_time() - inicio_us) / 1000));

    size_t comprimento = escrever(saida, saida_tamanho, documento);

    ESP_LOGI(ETIQUETA, "id=%s capacidade=%s resultado=sucesso ms=%lld",
             id_texto, capacidade->nome, (esp_timer_get_time() - inicio_us) / 1000);

    cJSON_Delete(documento);
    cJSON_Delete(requisicao);
    return comprimento;
}
