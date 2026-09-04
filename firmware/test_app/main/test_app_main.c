#include "ifenrir_capacidades.h"
#include "ifenrir_identidade.h"

#include "nvs_flash.h"
#include "unity.h"
#include "unity_test_runner.h"

void app_main(void)
{
    esp_err_t resultado = nvs_flash_init();
    if (resultado == ESP_ERR_NVS_NO_FREE_PAGES || resultado == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        resultado = nvs_flash_init();
    }
    ESP_ERROR_CHECK(resultado);

    ESP_ERROR_CHECK(ifenrir_identidade_iniciar());
    ifenrir_capacidades_iniciar();

    UNITY_BEGIN();
    unity_run_all_tests();
    UNITY_END();
}
