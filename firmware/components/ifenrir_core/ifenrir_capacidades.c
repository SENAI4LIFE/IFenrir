#include "ifenrir_capacidades.h"
#include "ifenrir_identidade.h"
#include "ifenrir_rede.h"

#include <string.h>
#include <stdio.h>

#include "esp_app_desc.h"
#include "esp_chip_info.h"
#include "esp_idf_version.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "sdkconfig.h"

#if CONFIG_IFENRIR_ATUADOR_LED_HABILITADO
#include "driver/gpio.h"
static bool s_led_ligado = false;
#endif

static const char *motivo_reinicio_texto(void)
{
    switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "energizacao";
    case ESP_RST_EXT:       return "pino_externo";
    case ESP_RST_SW:        return "software";
    case ESP_RST_PANIC:     return "panico";
    case ESP_RST_INT_WDT:   return "watchdog_interrupcao";
    case ESP_RST_TASK_WDT:  return "watchdog_tarefa";
    case ESP_RST_WDT:       return "watchdog";
    case ESP_RST_DEEPSLEEP: return "sono_profundo";
    case ESP_RST_BROWNOUT:  return "subtensao";
    case ESP_RST_SDIO:      return "sdio";
    default:                return "desconhecido";
    }
}

static const char *familia_soc(void)
{
    esp_chip_info_t informacao;
    esp_chip_info(&informacao);
    switch (informacao.model) {
    case CHIP_ESP32:   return "ESP32";
    case CHIP_ESP32S2: return "ESP32-S2";
    case CHIP_ESP32S3: return "ESP32-S3";
    case CHIP_ESP32C3: return "ESP32-C3";
    case CHIP_ESP32C2: return "ESP32-C2";
    case CHIP_ESP32C6: return "ESP32-C6";
    case CHIP_ESP32H2: return "ESP32-H2";
    default:           return "desconhecido";
    }
}

static ifenrir_codigo_t executar_listar_capacidades(const cJSON *argumentos, cJSON *resultado,
                                                    char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;

    cJSON *lista = cJSON_AddArrayToObject(resultado, "capacidades");
    if (lista == NULL) {
        return IFENRIR_ERRO_FALHA_INTERNA;
    }

    for (size_t indice = 0; indice < ifenrir_capacidades_total(); indice++) {
        const ifenrir_capacidade_t *capacidade = ifenrir_capacidades_indice(indice);
        cJSON *item = cJSON_CreateObject();
        if (item == NULL) {
            return IFENRIR_ERRO_FALHA_INTERNA;
        }
        cJSON_AddStringToObject(item, "nome", capacidade->nome);
        cJSON_AddStringToObject(item, "tipo", capacidade->tipo);
        cJSON_AddStringToObject(item, "resumo", capacidade->resumo);
        cJSON_AddBoolToObject(item, "permitida", capacidade->permitida);
        cJSON_AddItemToArray(lista, item);
    }
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_informacoes(const cJSON *argumentos, cJSON *resultado,
                                             char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;

    esp_chip_info_t informacao;
    esp_chip_info(&informacao);

    const esp_app_desc_t *descricao = esp_app_get_description();

    cJSON_AddStringToObject(resultado, "dispositivo", ifenrir_identidade_dispositivo());
    cJSON_AddStringToObject(resultado, "mac", ifenrir_identidade_mac());
    cJSON_AddStringToObject(resultado, "rotulo", ifenrir_identidade_rotulo());
    cJSON_AddStringToObject(resultado, "soc", familia_soc());
    cJSON_AddNumberToObject(resultado, "nucleos", informacao.cores);
    cJSON_AddNumberToObject(resultado, "revisao", informacao.revision);
    cJSON_AddStringToObject(resultado, "firmware", IFENRIR_FIRMWARE_VERSAO);
    cJSON_AddStringToObject(resultado, "aplicacao", descricao != NULL ? descricao->project_name : "ifenrir");
    cJSON_AddStringToObject(resultado, "esp_idf", IDF_VER);
    cJSON_AddStringToObject(resultado, "protocolo", IFENRIR_PROTOCOLO_VERSAO);
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_estado(const cJSON *argumentos, cJSON *resultado,
                                        char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;

    cJSON_AddStringToObject(resultado, "dispositivo", ifenrir_identidade_dispositivo());
    cJSON_AddStringToObject(resultado, "rotulo", ifenrir_identidade_rotulo());
    cJSON_AddNumberToObject(resultado, "tempo_atividade_ms", (double)(esp_timer_get_time() / 1000));
    cJSON_AddNumberToObject(resultado, "memoria_livre_bytes", esp_get_free_heap_size());
    cJSON_AddNumberToObject(resultado, "memoria_minima_bytes", esp_get_minimum_free_heap_size());
    cJSON_AddStringToObject(resultado, "motivo_reinicio", motivo_reinicio_texto());
    cJSON_AddStringToObject(resultado, "wifi", ifenrir_rede_estado_texto());
    cJSON_AddStringToObject(resultado, "ip", ifenrir_rede_ip());

    int8_t rssi = 0;
    if (ifenrir_rede_rssi(&rssi)) {
        cJSON_AddNumberToObject(resultado, "rssi_dbm", rssi);
    } else {
        cJSON_AddNullToObject(resultado, "rssi_dbm");
    }
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_tempo_atividade(const cJSON *argumentos, cJSON *resultado,
                                                 char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;
    cJSON_AddNumberToObject(resultado, "tempo_atividade_ms", (double)(esp_timer_get_time() / 1000));
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_memoria_livre(const cJSON *argumentos, cJSON *resultado,
                                               char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;
    cJSON_AddNumberToObject(resultado, "memoria_livre_bytes", esp_get_free_heap_size());
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_memoria_minima(const cJSON *argumentos, cJSON *resultado,
                                                char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;
    cJSON_AddNumberToObject(resultado, "memoria_minima_bytes", esp_get_minimum_free_heap_size());
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_motivo_reinicio(const cJSON *argumentos, cJSON *resultado,
                                                 char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;
    cJSON_AddStringToObject(resultado, "motivo_reinicio", motivo_reinicio_texto());
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_estado_wifi(const cJSON *argumentos, cJSON *resultado,
                                             char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;
    (void)detalhe;
    (void)detalhe_tamanho;
    cJSON_AddStringToObject(resultado, "estado", ifenrir_rede_estado_texto());
    cJSON_AddStringToObject(resultado, "ssid", ifenrir_rede_ssid());
    cJSON_AddStringToObject(resultado, "ip", ifenrir_rede_ip());
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_rssi_wifi(const cJSON *argumentos, cJSON *resultado,
                                           char *detalhe, size_t detalhe_tamanho)
{
    (void)argumentos;

    int8_t rssi = 0;
    if (!ifenrir_rede_rssi(&rssi)) {
        snprintf(detalhe, detalhe_tamanho, "dispositivo nao associado a um ponto de acesso");
        return IFENRIR_ERRO_FALHA_INTERNA;
    }
    cJSON_AddNumberToObject(resultado, "rssi_dbm", rssi);
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_ecoar(const cJSON *argumentos, cJSON *resultado,
                                       char *detalhe, size_t detalhe_tamanho)
{
    const cJSON *texto = cJSON_GetObjectItemCaseSensitive(argumentos, "texto");
    if (!cJSON_IsString(texto) || texto->valuestring == NULL) {
        snprintf(detalhe, detalhe_tamanho, "argumento texto deve ser uma string");
        return IFENRIR_ERRO_ARGUMENTO_INVALIDO;
    }
    if (strlen(texto->valuestring) > IFENRIR_LIMITE_TEXTO_ECO) {
        snprintf(detalhe, detalhe_tamanho, "argumento texto excede %d caracteres", IFENRIR_LIMITE_TEXTO_ECO);
        return IFENRIR_ERRO_ARGUMENTO_INVALIDO;
    }
    cJSON_AddStringToObject(resultado, "texto", texto->valuestring);
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_definir_rotulo(const cJSON *argumentos, cJSON *resultado,
                                                char *detalhe, size_t detalhe_tamanho)
{
    const cJSON *rotulo = cJSON_GetObjectItemCaseSensitive(argumentos, "rotulo");
    if (!cJSON_IsString(rotulo) || rotulo->valuestring == NULL) {
        snprintf(detalhe, detalhe_tamanho, "argumento rotulo deve ser uma string");
        return IFENRIR_ERRO_ARGUMENTO_INVALIDO;
    }

    size_t comprimento = strlen(rotulo->valuestring);
    if (comprimento == 0 || comprimento > IFENRIR_LIMITE_ROTULO) {
        snprintf(detalhe, detalhe_tamanho, "rotulo deve ter entre 1 e %d caracteres", IFENRIR_LIMITE_ROTULO);
        return IFENRIR_ERRO_ARGUMENTO_INVALIDO;
    }

    if (ifenrir_identidade_definir_rotulo(rotulo->valuestring) != ESP_OK) {
        snprintf(detalhe, detalhe_tamanho, "falha ao gravar o rotulo em NVS");
        return IFENRIR_ERRO_FALHA_INTERNA;
    }

    cJSON_AddStringToObject(resultado, "rotulo", ifenrir_identidade_rotulo());
    cJSON_AddBoolToObject(resultado, "persistido", true);
    return IFENRIR_OK;
}

static ifenrir_codigo_t executar_definir_led(const cJSON *argumentos, cJSON *resultado,
                                             char *detalhe, size_t detalhe_tamanho)
{
#if CONFIG_IFENRIR_ATUADOR_LED_HABILITADO
    const cJSON *ligado = cJSON_GetObjectItemCaseSensitive(argumentos, "ligado");
    if (!cJSON_IsBool(ligado)) {
        snprintf(detalhe, detalhe_tamanho, "argumento ligado deve ser booleano");
        return IFENRIR_ERRO_ARGUMENTO_INVALIDO;
    }

    s_led_ligado = cJSON_IsTrue(ligado);
    gpio_set_level(CONFIG_IFENRIR_ATUADOR_LED_GPIO, s_led_ligado ? 1 : 0);

    cJSON_AddBoolToObject(resultado, "ligado", s_led_ligado);
    cJSON_AddNumberToObject(resultado, "gpio", CONFIG_IFENRIR_ATUADOR_LED_GPIO);
    return IFENRIR_OK;
#else
    (void)argumentos;
    (void)resultado;
    snprintf(detalhe, detalhe_tamanho, "atuador desabilitado na configuracao do firmware");
    return IFENRIR_ERRO_CAPACIDADE_NAO_PERMITIDA;
#endif
}

static const ifenrir_capacidade_t s_registro[] = {
    { "listar_capacidades", "leitura",
      "Lista as capacidades declaradas e permitidas pelo firmware.",
      true, executar_listar_capacidades },
    { "obter_informacoes_dispositivo", "leitura",
      "Identidade do dispositivo, SoC, firmware e versao do ESP-IDF.",
      true, executar_informacoes },
    { "obter_estado", "leitura",
      "Estado consolidado de memoria, atividade e conectividade.",
      true, executar_estado },
    { "obter_tempo_atividade", "leitura",
      "Tempo decorrido desde o ultimo reinicio.",
      true, executar_tempo_atividade },
    { "obter_memoria_livre", "leitura",
      "Heap livre atual em bytes.",
      true, executar_memoria_livre },
    { "obter_memoria_minima", "leitura",
      "Menor heap livre observado desde o reinicio.",
      true, executar_memoria_minima },
    { "obter_motivo_reinicio", "leitura",
      "Motivo do ultimo reinicio relatado pelo ESP-IDF.",
      true, executar_motivo_reinicio },
    { "obter_estado_wifi", "leitura",
      "Estado da conexao Wi-Fi, SSID e endereco IP.",
      true, executar_estado_wifi },
    { "obter_rssi_wifi", "leitura",
      "RSSI do ponto de acesso associado, em dBm.",
      true, executar_rssi_wifi },
    { "ecoar", "leitura",
      "Devolve o texto recebido, para medicao de latencia e validacao de argumentos.",
      true, executar_ecoar },
    { "definir_rotulo", "escrita",
      "Grava em NVS um rotulo operacional do dispositivo.",
      true, executar_definir_rotulo },
    { "definir_led", "escrita",
      "Aciona um LED em GPIO explicitamente configurado.",
#if CONFIG_IFENRIR_ATUADOR_LED_HABILITADO
      true,
#else
      false,
#endif
      executar_definir_led },
};

void ifenrir_capacidades_iniciar(void)
{
#if CONFIG_IFENRIR_ATUADOR_LED_HABILITADO
    gpio_config_t configuracao = {
        .pin_bit_mask = 1ULL << CONFIG_IFENRIR_ATUADOR_LED_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&configuracao);
    gpio_set_level(CONFIG_IFENRIR_ATUADOR_LED_GPIO, 0);
    s_led_ligado = false;
#endif
}

size_t ifenrir_capacidades_total(void)
{
    return sizeof(s_registro) / sizeof(s_registro[0]);
}

const ifenrir_capacidade_t *ifenrir_capacidades_indice(size_t indice)
{
    if (indice >= ifenrir_capacidades_total()) {
        return NULL;
    }
    return &s_registro[indice];
}

const ifenrir_capacidade_t *ifenrir_capacidades_buscar(const char *nome)
{
    if (nome == NULL) {
        return NULL;
    }
    for (size_t indice = 0; indice < ifenrir_capacidades_total(); indice++) {
        if (strcmp(s_registro[indice].nome, nome) == 0) {
            return &s_registro[indice];
        }
    }
    return NULL;
}
