idf_component_register(
    SRCS
        "test_app_main.c"
        "test_protocolo.c"
        "test_capacidades.c"
    INCLUDE_DIRS "."
    REQUIRES ifenrir_core unity json nvs_flash
    WHOLE_ARCHIVE
)
