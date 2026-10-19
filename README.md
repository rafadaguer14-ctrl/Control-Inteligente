# Control Inteligente

Simulador educativo y control físico de un motor DC con ESP32-S3: PID, lógica difusa, regresión lineal y redes neuronales.

**Autores:** Rafael Daguer Puello — T00069109; Yeison Palacios Muleth — T00069083.

## Iniciar

Desde esta carpeta ejecuta `python -m http.server 8000` y abre http://localhost:8000/simulador_motor_dc.html en Chrome o Edge. Para simulación no necesitas conectar hardware.

| Módulo | Archivo |
|---|---|
| Motor físico PID y ensayos con recomendación MLP | [simulador_motor_dc.html](simulador_motor_dc.html) |
| Simulación PID | [simulacion_motor_dc.html](simulacion_motor_dc.html) |
| Simulación Fuzzy | [fuzzy.html](fuzzy.html) |
| Motor físico Fuzzy | [fuzzy-motor.html](fuzzy-motor.html) |
| Regresión lineal con datasets | [regresion.html](regresion.html) |
| Laboratorio interactivo de redes neuronales | [red-neuronal.html](red-neuronal.html) |

## Montaje físico

Carga [ControlMotor.ino](firmware/ControlMotor/ControlMotor.ino) en Arduino IDE para ESP32-S3. Este firmware unifica PID y Fuzzy; las interfaces seleccionan el modo. Consulta [configuración y protocolo](firmware/ControlMotor/LEEME.md). Cierra el Monitor Serial antes de conectar desde el navegador (115200 baud).

Pines: ENA GPIO4, encoder GPIO7 y potenciómetro GPIO8. Se conserva el montaje L298N con IN1/IN2 fijados a 5 V/GND, divisor para la señal del encoder y filtros físicos. Los GPIO del ESP32 trabajan a 3,3 V. La fuente de 12 V del montaje requiere regulación adecuada para el motor y la lógica: no alimentes directamente el motor amarillo a 12 V.

Esta versión conserva el filtrado de software del firmware actual, además de los filtros físicos. Referencia 0–200 RPM, PWM mostrado 0–100 %, 40 flancos por vuelta. La placa detiene la salida cuando pierde el latido de la interfaz.

## Actividad PID con redes neuronales

La MLP aprende a estimar el costo de una combinación de referencia, Kp, Ki y Kd a partir de ensayos físicos. La recomendación se evalúa después en el motor; no sustituye al PID ejecutado en la placa.

- [Guía de ensayos y entrenamiento](GUIA_PID_RED_NEURONAL.md)
- [Informe de la actividad (5 páginas)](informes/PID-Red-Neuronal/Informe_PID_Red_Neuronal.pdf)
- [Dataset relacionado con el informe](informes/PID-Red-Neuronal/ensayos-pid.json)
- [Resumen de ensayos](informes/PID-Red-Neuronal/resumen_ensayos.csv)
- [Particiones y trazabilidad](informes/PID-Red-Neuronal/particiones.json)
- [Evaluación del modelo](informes/PID-Red-Neuronal/evaluacion-pid-mlp.json)

La validación inicial a 100 RPM comparó tres ensayos por controlador y obtuvo una reducción del costo del 34 %. El informe distingue esa validación de los ensayos posteriores, recoge las limitaciones del modelo y muestra que una configuración manual tuvo un costo menor. No se interpreta como garantía para otras velocidades o cargas.

## Datasets y demostraciones

- `Temperatura_Colombia_1961_2019.csv`: 59 observaciones anuales de Colombia, extraídas de `Temperature_change_Data.csv`. Se analiza la variable de cambio de temperatura; no representa temperatura absoluta. La fuente incluida no verifica por sí sola unidades ni período de referencia.
- `ensayos-pid.json`: exportación del proyecto al preparar esta publicación. Para reproducir el informe, utiliza la copia versionada dentro de `informes/PID-Red-Neuronal/`.
- `datasets-adicionales/`: datasets adicionales disponibles en el proyecto.
- [Demostración de arquitectura, activaciones y entrenamiento](DEMOSTRACION_RED_NEURONAL.md).
- `entregables/`: paquetes autocontenidos de regresión y laboratorio neuronal, y el informe inicial del controlador PID.

## Video de funcionamiento

El archivo **Prueba de Funcionamiento PID Redes Neuronales.mp4** se distribuye como adjunto de la [versión de esta entrega](https://github.com/rafadaguer14-ctrl/Control-Inteligente/releases/tag/entrega-2026-10-19). Conserva la calidad del original y se aloja fuera de Git por superar el límite de 100 MiB por archivo. El acceso requiere permisos del repositorio privado.

## Verificación

Con Node.js, ejecutar:

```sh
node test-regression.cjs
node test-neural.cjs
node test-pid-learning.cjs
```

Estas pruebas verifican lógica matemática y métricas. No sustituyen la compilación del firmware ni una prueba del montaje físico.
