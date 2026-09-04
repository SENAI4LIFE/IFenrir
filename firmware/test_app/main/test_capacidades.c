#include "ifenrir_capacidades.h"
#include "ifenrir_contrato.h"
#include "ifenrir_identidade.h"

#include <string.h>

#include "sdkconfig.h"
#include "unity.h"

static const char *EXIGIDAS[] = {
    "listar_capacidades",
    "obter_informacoes_dispositivo",
    "obter_estado",
    "obter_tempo_atividade",
    "obter_memoria_livre",
    "obter_memoria_minima",
    "obter_motivo_reinicio",
    "obter_estado_wifi",
    "obter_rssi_wifi",
};

static const char *PROIBIDAS[] = {
    "executar_shell",
    "exec",
    "gpio_escrever",
    "ler_memoria",
    "escrever_arquivo",
    "eval",
    "system",
};

TEST_CASE("registro declara todas as capacidades exigidas pela pesquisa", "[capacidades]")
{
    for (size_t indice = 0; indice < sizeof(EXIGIDAS) / sizeof(EXIGIDAS[0]); indice++) {
        TEST_ASSERT_NOT_NULL_MESSAGE(ifenrir_capacidades_buscar(EXIGIDAS[indice]), EXIGIDAS[indice]);
    }
}

TEST_CASE("registro nao expoe capacidades de execucao arbitraria", "[capacidades][seguranca]")
{
    for (size_t indice = 0; indice < sizeof(PROIBIDAS) / sizeof(PROIBIDAS[0]); indice++) {
        TEST_ASSERT_NULL_MESSAGE(ifenrir_capacidades_buscar(PROIBIDAS[indice]), PROIBIDAS[indice]);
    }
}

TEST_CASE("capacidade desconhecida nao e encontrada", "[capacidades][seguranca]")
{
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar("capacidade_inexistente"));
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar(""));
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar(NULL));
}

TEST_CASE("busca e sensivel a caixa e nao aceita variacoes", "[capacidades][seguranca]")
{
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar("OBTER_ESTADO"));
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar("obter_estado "));
    TEST_ASSERT_NULL(ifenrir_capacidades_buscar(" obter_estado"));
    TEST_ASSERT_NOT_NULL(ifenrir_capacidades_buscar("obter_estado"));
}

TEST_CASE("todas as capacidades possuem nome, tipo, resumo e executor", "[capacidades]")
{
    for (size_t indice = 0; indice < ifenrir_capacidades_total(); indice++) {
        const ifenrir_capacidade_t *capacidade = ifenrir_capacidades_indice(indice);
        TEST_ASSERT_NOT_NULL(capacidade);
        TEST_ASSERT_NOT_NULL(capacidade->nome);
        TEST_ASSERT_NOT_NULL(capacidade->tipo);
        TEST_ASSERT_NOT_NULL(capacidade->resumo);
        TEST_ASSERT_NOT_NULL(capacidade->executar);
        TEST_ASSERT_GREATER_THAN(0, strlen(capacidade->nome));
        TEST_ASSERT_TRUE(strcmp(capacidade->tipo, "leitura") == 0 || strcmp(capacidade->tipo, "escrita") == 0);
    }
}

TEST_CASE("nomes de capacidade sao unicos", "[capacidades]")
{
    size_t total = ifenrir_capacidades_total();
    for (size_t i = 0; i < total; i++) {
        for (size_t j = i + 1; j < total; j++) {
            TEST_ASSERT_NOT_EQUAL(0, strcmp(ifenrir_capacidades_indice(i)->nome,
                                            ifenrir_capacidades_indice(j)->nome));
        }
    }
}

TEST_CASE("indice fora do intervalo devolve nulo", "[capacidades]")
{
    TEST_ASSERT_NULL(ifenrir_capacidades_indice(ifenrir_capacidades_total()));
    TEST_ASSERT_NULL(ifenrir_capacidades_indice(ifenrir_capacidades_total() + 100));
    TEST_ASSERT_NOT_NULL(ifenrir_capacidades_indice(0));
}

TEST_CASE("o atuador segue a configuracao de compilacao", "[capacidades][seguranca]")
{
    const ifenrir_capacidade_t *led = ifenrir_capacidades_buscar("definir_led");
    TEST_ASSERT_NOT_NULL(led);
    TEST_ASSERT_EQUAL_STRING("escrita", led->tipo);

#if CONFIG_IFENRIR_ATUADOR_LED_HABILITADO
    TEST_ASSERT_TRUE(led->permitida);
#else
    TEST_ASSERT_FALSE(led->permitida);
#endif
}

TEST_CASE("capacidades de leitura estao permitidas", "[capacidades]")
{
    for (size_t indice = 0; indice < ifenrir_capacidades_total(); indice++) {
        const ifenrir_capacidade_t *capacidade = ifenrir_capacidades_indice(indice);
        if (strcmp(capacidade->tipo, "leitura") == 0) {
            TEST_ASSERT_TRUE_MESSAGE(capacidade->permitida, capacidade->nome);
        }
    }
}

TEST_CASE("identidade do dispositivo deriva do MAC", "[identidade]")
{
    const char *dispositivo = ifenrir_identidade_dispositivo();
    const char *mac = ifenrir_identidade_mac();

    TEST_ASSERT_NOT_NULL(dispositivo);
    TEST_ASSERT_NOT_NULL(mac);
    TEST_ASSERT_EQUAL_STRING_LEN("ifenrir-", dispositivo, 8);
    TEST_ASSERT_EQUAL(17, strlen(mac));
}

TEST_CASE("rotulo respeita os limites do contrato", "[identidade]")
{
    char excedente[IFENRIR_LIMITE_ROTULO + 5];
    memset(excedente, 'a', sizeof(excedente) - 1);
    excedente[sizeof(excedente) - 1] = '\0';

    TEST_ASSERT_NOT_EQUAL(ESP_OK, ifenrir_identidade_definir_rotulo(""));
    TEST_ASSERT_NOT_EQUAL(ESP_OK, ifenrir_identidade_definir_rotulo(excedente));
    TEST_ASSERT_NOT_EQUAL(ESP_OK, ifenrir_identidade_definir_rotulo(NULL));

    TEST_ASSERT_EQUAL(ESP_OK, ifenrir_identidade_definir_rotulo("bancada"));
    TEST_ASSERT_EQUAL_STRING("bancada", ifenrir_identidade_rotulo());
}
