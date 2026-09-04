#include "ifenrir_contrato.h"
#include "ifenrir_protocolo.h"

#include <string.h>
#include <stdio.h>

#include "cJSON.h"
#include "esp_system.h"
#include "unity.h"

static char s_saida[IFENRIR_LIMITE_RESPOSTA_BYTES];

static cJSON *processar(const char *requisicao)
{
    size_t tamanho = ifenrir_protocolo_processar(requisicao, strlen(requisicao), s_saida, sizeof(s_saida));
    TEST_ASSERT_GREATER_THAN(0, tamanho);
    cJSON *resposta = cJSON_ParseWithLength(s_saida, tamanho);
    TEST_ASSERT_NOT_NULL(resposta);
    return resposta;
}

static void esperar_erro(const char *requisicao, const char *codigo_esperado)
{
    cJSON *resposta = processar(requisicao);

    const cJSON *sucesso = cJSON_GetObjectItemCaseSensitive(resposta, "sucesso");
    TEST_ASSERT_TRUE(cJSON_IsFalse(sucesso));

    const cJSON *erro = cJSON_GetObjectItemCaseSensitive(resposta, "erro");
    TEST_ASSERT_NOT_NULL(erro);

    const cJSON *codigo = cJSON_GetObjectItemCaseSensitive(erro, "codigo");
    TEST_ASSERT_TRUE(cJSON_IsString(codigo));
    TEST_ASSERT_EQUAL_STRING(codigo_esperado, codigo->valuestring);

    cJSON_Delete(resposta);
}

TEST_CASE("requisicao valida devolve sucesso e a capacidade executada", "[protocolo]")
{
    cJSON *resposta = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"t1\",\"capacidade\":\"obter_tempo_atividade\"}");

    TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(resposta, "sucesso")));
    TEST_ASSERT_EQUAL_STRING("obter_tempo_atividade",
                             cJSON_GetObjectItemCaseSensitive(resposta, "capacidade")->valuestring);
    TEST_ASSERT_NOT_NULL(cJSON_GetObjectItemCaseSensitive(resposta, "resultado"));

    cJSON_Delete(resposta);
}

TEST_CASE("resposta repete o identificador de correlacao", "[protocolo]")
{
    cJSON *resposta = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"correlacao-9f2\",\"capacidade\":\"obter_estado\"}");

    TEST_ASSERT_EQUAL_STRING("correlacao-9f2",
                             cJSON_GetObjectItemCaseSensitive(resposta, "id")->valuestring);

    cJSON_Delete(resposta);
}

TEST_CASE("resposta declara a versao do protocolo e o tempo de execucao", "[protocolo]")
{
    cJSON *resposta = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"t2\",\"capacidade\":\"obter_memoria_livre\"}");

    TEST_ASSERT_EQUAL_STRING(IFENRIR_PROTOCOLO_VERSAO,
                             cJSON_GetObjectItemCaseSensitive(resposta, "protocolo")->valuestring);
    TEST_ASSERT_TRUE(cJSON_IsNumber(cJSON_GetObjectItemCaseSensitive(resposta, "ms")));

    cJSON_Delete(resposta);
}

TEST_CASE("JSON malformado e recusado", "[protocolo]")
{
    esperar_erro("{isto nao e json", "MENSAGEM_MALFORMADA");
}

TEST_CASE("carga vazia e recusada", "[protocolo]")
{
    size_t tamanho = ifenrir_protocolo_processar("", 0, s_saida, sizeof(s_saida));
    TEST_ASSERT_GREATER_THAN(0, tamanho);
    TEST_ASSERT_NOT_NULL(strstr(s_saida, "MENSAGEM_MALFORMADA"));
}

TEST_CASE("versao de protocolo divergente e recusada", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/999\",\"id\":\"t3\",\"capacidade\":\"obter_estado\"}", "PROTOCOLO_INVALIDO");
}

TEST_CASE("protocolo ausente e recusado", "[protocolo]")
{
    esperar_erro("{\"id\":\"t4\",\"capacidade\":\"obter_estado\"}", "PROTOCOLO_INVALIDO");
}

TEST_CASE("identificador ausente e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"capacidade\":\"obter_estado\"}", "CAMPO_OBRIGATORIO_AUSENTE");
}

TEST_CASE("identificador vazio e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"\",\"capacidade\":\"obter_estado\"}",
                 "CAMPO_OBRIGATORIO_AUSENTE");
}

TEST_CASE("identificador com tipo errado e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":42,\"capacidade\":\"obter_estado\"}",
                 "CAMPO_OBRIGATORIO_AUSENTE");
}

TEST_CASE("identificador acima do limite e recusado", "[protocolo]")
{
    char requisicao[256];
    char identificador[IFENRIR_LIMITE_ID_CARACTERES + 10];
    memset(identificador, 'x', sizeof(identificador) - 1);
    identificador[sizeof(identificador) - 1] = '\0';

    snprintf(requisicao, sizeof(requisicao),
             "{\"protocolo\":\"ifenrir/1\",\"id\":\"%s\",\"capacidade\":\"obter_estado\"}", identificador);

    esperar_erro(requisicao, "CAMPO_OBRIGATORIO_AUSENTE");
}

TEST_CASE("capacidade ausente e recusada", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t5\"}", "CAMPO_OBRIGATORIO_AUSENTE");
}

TEST_CASE("capacidade desconhecida e recusada", "[protocolo][seguranca]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t6\",\"capacidade\":\"executar_shell\"}",
                 "CAPACIDADE_DESCONHECIDA");
}

TEST_CASE("capacidade declarada porem nao permitida e recusada", "[protocolo][seguranca]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t7\",\"capacidade\":\"definir_led\",\"argumentos\":{\"ligado\":true}}",
                 "CAPACIDADE_NAO_PERMITIDA");
}

TEST_CASE("campo argumentos com tipo errado e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t8\",\"capacidade\":\"obter_estado\",\"argumentos\":\"texto\"}",
                 "ARGUMENTO_INVALIDO");
}

TEST_CASE("mensagem acima do limite de bytes e recusada", "[protocolo][seguranca]")
{
    static char requisicao[IFENRIR_LIMITE_REQUISICAO_BYTES + 200];
    char preenchimento[IFENRIR_LIMITE_REQUISICAO_BYTES + 100];
    memset(preenchimento, 'y', sizeof(preenchimento) - 1);
    preenchimento[sizeof(preenchimento) - 1] = '\0';

    snprintf(requisicao, sizeof(requisicao),
             "{\"protocolo\":\"ifenrir/1\",\"id\":\"t9\",\"capacidade\":\"ecoar\",\"argumentos\":{\"texto\":\"%s\"}}",
             preenchimento);

    esperar_erro(requisicao, "MENSAGEM_EXCEDE_LIMITE");
}

TEST_CASE("ecoar devolve o texto recebido", "[protocolo]")
{
    cJSON *resposta = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"t10\",\"capacidade\":\"ecoar\",\"argumentos\":{\"texto\":\"ifenrir\"}}");

    const cJSON *resultado = cJSON_GetObjectItemCaseSensitive(resposta, "resultado");
    TEST_ASSERT_EQUAL_STRING("ifenrir", cJSON_GetObjectItemCaseSensitive(resultado, "texto")->valuestring);

    cJSON_Delete(resposta);
}

TEST_CASE("ecoar com argumento de tipo errado e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t11\",\"capacidade\":\"ecoar\",\"argumentos\":{\"texto\":123}}",
                 "ARGUMENTO_INVALIDO");
}

TEST_CASE("ecoar sem argumento obrigatorio e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t12\",\"capacidade\":\"ecoar\",\"argumentos\":{}}",
                 "ARGUMENTO_INVALIDO");
}

TEST_CASE("ecoar acima do limite de caracteres e recusado", "[protocolo]")
{
    char requisicao[400];
    char texto[IFENRIR_LIMITE_TEXTO_ECO + 40];
    memset(texto, 'z', sizeof(texto) - 1);
    texto[sizeof(texto) - 1] = '\0';

    snprintf(requisicao, sizeof(requisicao),
             "{\"protocolo\":\"ifenrir/1\",\"id\":\"t13\",\"capacidade\":\"ecoar\",\"argumentos\":{\"texto\":\"%s\"}}",
             texto);

    esperar_erro(requisicao, "ARGUMENTO_INVALIDO");
}

TEST_CASE("rotulo vazio e recusado", "[protocolo]")
{
    esperar_erro("{\"protocolo\":\"ifenrir/1\",\"id\":\"t14\",\"capacidade\":\"definir_rotulo\",\"argumentos\":{\"rotulo\":\"\"}}",
                 "ARGUMENTO_INVALIDO");
}

TEST_CASE("rotulo acima do limite e recusado", "[protocolo]")
{
    char requisicao[300];
    char rotulo[IFENRIR_LIMITE_ROTULO + 20];
    memset(rotulo, 'r', sizeof(rotulo) - 1);
    rotulo[sizeof(rotulo) - 1] = '\0';

    snprintf(requisicao, sizeof(requisicao),
             "{\"protocolo\":\"ifenrir/1\",\"id\":\"t15\",\"capacidade\":\"definir_rotulo\",\"argumentos\":{\"rotulo\":\"%s\"}}",
             rotulo);

    esperar_erro(requisicao, "ARGUMENTO_INVALIDO");
}

TEST_CASE("definir_rotulo persiste e e refletido no estado", "[protocolo]")
{
    cJSON *escrita = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"t16\",\"capacidade\":\"definir_rotulo\",\"argumentos\":{\"rotulo\":\"unity-bancada\"}}");
    TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(escrita, "sucesso")));
    cJSON_Delete(escrita);

    cJSON *estado = processar("{\"protocolo\":\"ifenrir/1\",\"id\":\"t17\",\"capacidade\":\"obter_estado\"}");
    const cJSON *resultado = cJSON_GetObjectItemCaseSensitive(estado, "resultado");
    TEST_ASSERT_EQUAL_STRING("unity-bancada",
                             cJSON_GetObjectItemCaseSensitive(resultado, "rotulo")->valuestring);
    cJSON_Delete(estado);
}

TEST_CASE("requisicoes repetidas mantem respostas independentes", "[protocolo][robustez]")
{
    for (int indice = 0; indice < 50; indice++) {
        char requisicao[160];
        char identificador[32];
        snprintf(identificador, sizeof(identificador), "rep-%d", indice);
        snprintf(requisicao, sizeof(requisicao),
                 "{\"protocolo\":\"ifenrir/1\",\"id\":\"%s\",\"capacidade\":\"obter_memoria_livre\"}", identificador);

        cJSON *resposta = processar(requisicao);
        TEST_ASSERT_TRUE(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(resposta, "sucesso")));
        TEST_ASSERT_EQUAL_STRING(identificador, cJSON_GetObjectItemCaseSensitive(resposta, "id")->valuestring);
        cJSON_Delete(resposta);
    }
}

TEST_CASE("rajada de mensagens invalidas nao consome memoria", "[protocolo][robustez]")
{
    uint32_t antes = esp_get_free_heap_size();

    for (int indice = 0; indice < 200; indice++) {
        ifenrir_protocolo_processar("{quebrado", 9, s_saida, sizeof(s_saida));
    }

    uint32_t depois = esp_get_free_heap_size();
    TEST_ASSERT_INT_WITHIN(2048, antes, depois);
}

TEST_CASE("codigos de erro possuem texto estavel", "[protocolo]")
{
    TEST_ASSERT_EQUAL_STRING("OK", ifenrir_codigo_texto(IFENRIR_OK));
    TEST_ASSERT_EQUAL_STRING("PROTOCOLO_INVALIDO", ifenrir_codigo_texto(IFENRIR_ERRO_PROTOCOLO_INVALIDO));
    TEST_ASSERT_EQUAL_STRING("MENSAGEM_MALFORMADA", ifenrir_codigo_texto(IFENRIR_ERRO_MENSAGEM_MALFORMADA));
    TEST_ASSERT_EQUAL_STRING("MENSAGEM_EXCEDE_LIMITE", ifenrir_codigo_texto(IFENRIR_ERRO_MENSAGEM_EXCEDE_LIMITE));
    TEST_ASSERT_EQUAL_STRING("CAMPO_OBRIGATORIO_AUSENTE", ifenrir_codigo_texto(IFENRIR_ERRO_CAMPO_OBRIGATORIO_AUSENTE));
    TEST_ASSERT_EQUAL_STRING("CAPACIDADE_DESCONHECIDA", ifenrir_codigo_texto(IFENRIR_ERRO_CAPACIDADE_DESCONHECIDA));
    TEST_ASSERT_EQUAL_STRING("CAPACIDADE_NAO_PERMITIDA", ifenrir_codigo_texto(IFENRIR_ERRO_CAPACIDADE_NAO_PERMITIDA));
    TEST_ASSERT_EQUAL_STRING("ARGUMENTO_INVALIDO", ifenrir_codigo_texto(IFENRIR_ERRO_ARGUMENTO_INVALIDO));
    TEST_ASSERT_EQUAL_STRING("FALHA_INTERNA", ifenrir_codigo_texto(IFENRIR_ERRO_FALHA_INTERNA));
}
