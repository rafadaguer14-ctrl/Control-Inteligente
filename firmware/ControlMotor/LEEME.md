# Un solo firmware para PID y Fuzzy

Carga `ControlMotor.ino` una vez en la ESP32 S3. Ambos algoritmos están incluidos en este único archivo; no necesita PidCore.h ni FuzzyCore.h externos.

## Uso

1. Compila y carga ControlMotor.ino con la misma configuración de placa y puerto del montaje anterior. Serial: 115200 baud.
2. Cierra el Monitor Serial de Arduino.
3. Abre `simulador_motor_dc.html` para PID o `fuzzy-motor.html` para Fuzzy en Chrome o Edge.
4. Pulsa Conectar ESP32. La página envía MODE PID o MODE FUZZY y espera la confirmación de la placa.
5. Ajusta la referencia y los parámetros. La referencia inicial siempre es cero.
6. Para cambiar, pulsa Desconectar, abre la otra interfaz y conecta el mismo puerto. No es necesario volver a cargar el sketch. El puerto USB solo puede pertenecer a una página a la vez.

Abrir un HTML por sí solo no abre el puerto USB: el navegador requiere seleccionar el dispositivo con Conectar ESP32. Las páginas de simulación no cambian el controlador físico.

## Comportamiento

- Arranque sin modo seleccionado y PWM cero.
- Toda selección MODE detiene la salida, reinicia ambos controladores y deshabilita la perturbación por potenciómetro.
- Los parámetros de cada controlador se conservan en RAM al cambiar de modo; no se guardan tras apagar o reiniciar la ESP32.
- Las páginas verifican V:5 y el modo confirmado antes de aceptar controles.
- Cada página envía un latido de su modo. Si desaparece durante más de tres segundos, la placa corta el PWM y elimina la selección de modo.
- Referencia 0–200 RPM. PWM 0–255 interno, 0–100 % en las gráficas.
- Mismos pines: ENA GPIO4, encoder GPIO7, potenciómetro GPIO8. Mismo L298N, divisor y filtros físicos.
- Se conservan 40 flancos por vuelta, medición cada 250 ms, rechazo de flancos a menos de 100 µs, mediana y EMA.
- PID inicial: 0,15 / 0,20 / 0,005. Fuzzy inicial: 100 RPM / 200 RPM/s / 30 %/s. Son parámetros iniciales, no una nueva sintonización validada.
- Sin impulso de arranque ni PWM mínimo. El motor puede detenerse si el mando es insuficiente. La rapidez Fuzzy cero congela el mando; Detener lo apaga.

Los sketches anteriores se conservan como respaldo. Las interfaces actualizadas requieren ControlMotor v5. Se verificaron la lógica de selección y el protocolo en pruebas automatizadas; la compilación para ESP32 y el ensayo físico deben realizarse en Arduino IDE y en el montaje.
