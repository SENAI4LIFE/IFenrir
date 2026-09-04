idf_component_register(
    SRCS
        "ifenrir_principal.c"
        "ifenrir_transporte_serial.c"
        "ifenrir_transporte_websocket.c"
    INCLUDE_DIRS "."
    REQUIRES ifenrir_core esp_driver_uart esp_timer
)
