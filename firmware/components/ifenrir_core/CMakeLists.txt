idf_component_register(
    SRCS
        "ifenrir_identidade.c"
        "ifenrir_capacidades.c"
        "ifenrir_protocolo.c"
        "ifenrir_rede.c"
    INCLUDE_DIRS "."
    REQUIRES json nvs_flash esp_wifi esp_netif esp_event esp_timer esp_app_format driver
)
