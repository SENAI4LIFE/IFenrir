#include "ifenrir_transporte_serial.h"
#include "ifenrir_contrato.h"
#include "ifenrir_protocolo.h"

#include <string.h>

#include "driver/uart.h"
#include "driver/uart_vfs.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *ETIQUETA = "ifenrir_serial";

#define IFENRIR_SERIAL_UART UART_NUM_0
#define IFENRIR_SERIAL_BUFFER_RX 2048
#define IFENRIR_SERIAL_LINHA (IFENRIR_LIMITE_REQUISICAO_BYTES + 64)

static char s_linha[IFENRIR_SERIAL_LINHA];
static char s_resposta[IFENRIR_LIMITE_RESPOSTA_BYTES];

static void emitir(const char *carga, size_t tamanho)
{
    uart_write_bytes(IFENRIR_SERIAL_UART, IFENRIR_SENTINELA, IFENRIR_SENTINELA_TAMANHO);
    uart_write_bytes(IFENRIR_SERIAL_UART, carga, tamanho);
    uart_write_bytes(IFENRIR_SERIAL_UART, "\n", 1);
}

static void tratar_linha(char *linha, size_t tamanho)
{
    while (tamanho > 0 && (linha[tamanho - 1] == '\r' || linha[tamanho - 1] == ' ')) {
        tamanho--;
    }
    linha[tamanho] = '\0';

    if (tamanho == 0) {
        return;
    }

    const char *carga = linha;
    size_t carga_tamanho = tamanho;

    if (tamanho >= IFENRIR_SENTINELA_TAMANHO &&
        strncmp(linha, IFENRIR_SENTINELA, IFENRIR_SENTINELA_TAMANHO) == 0) {
        carga += IFENRIR_SENTINELA_TAMANHO;
        carga_tamanho -= IFENRIR_SENTINELA_TAMANHO;
    } else if (linha[0] != '{') {
        return;
    }

    size_t resposta_tamanho = ifenrir_protocolo_processar(carga, carga_tamanho,
                                                          s_resposta, sizeof(s_resposta));
    if (resposta_tamanho > 0) {
        emitir(s_resposta, resposta_tamanho);
    }
}

static void tarefa_serial(void *argumento)
{
    (void)argumento;

    size_t preenchido = 0;
    bool descartando = false;
    uint8_t byte = 0;

    ESP_LOGI(ETIQUETA, "transporte serial pronto em %d bauds", CONFIG_ESP_CONSOLE_UART_BAUDRATE);

    while (true) {
        int lidos = uart_read_bytes(IFENRIR_SERIAL_UART, &byte, 1, pdMS_TO_TICKS(200));
        if (lidos <= 0) {
            continue;
        }

        if (byte == '\n') {
            if (descartando) {
                ESP_LOGW(ETIQUETA, "linha descartada por exceder o limite de recepcao");
                size_t tamanho = ifenrir_protocolo_processar(NULL, IFENRIR_LIMITE_REQUISICAO_BYTES + 1,
                                                             s_resposta, sizeof(s_resposta));
                if (tamanho > 0) {
                    emitir(s_resposta, tamanho);
                }
            } else {
                tratar_linha(s_linha, preenchido);
            }
            preenchido = 0;
            descartando = false;
            continue;
        }

        if (preenchido + 1 >= sizeof(s_linha)) {
            descartando = true;
            preenchido = 0;
            continue;
        }

        s_linha[preenchido++] = (char)byte;
    }
}

esp_err_t ifenrir_transporte_serial_iniciar(void)
{
    esp_err_t resultado = uart_driver_install(IFENRIR_SERIAL_UART, IFENRIR_SERIAL_BUFFER_RX, 0, 0, NULL, 0);
    if (resultado != ESP_OK && resultado != ESP_ERR_INVALID_STATE) {
        return resultado;
    }

    uart_vfs_dev_use_driver(IFENRIR_SERIAL_UART);

    if (xTaskCreate(tarefa_serial, "ifenrir_serial", 5120, NULL, 5, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
