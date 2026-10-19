# Red neuronal para recomendar ganancias PID

Autor del proyecto: Rafael Daguer Puello.

## Abrir el laboratorio

Abre `simulador_motor_dc.html` en Chrome o Edge, conecta la ESP32 como habitualmente y pulsa **Laboratorio · PID + red neuronal**. Utiliza el firmware unificado v5 existente. El laboratorio comparte la conexión de la interfaz; no abras simultáneamente el monitor serial.

## 1. Obtener datos experimentales

1. Mantén constante alimentación, carga, posición del encoder y duración de los ensayos. Anota esos detalles en tu informe.
2. Usa **Detener** y espera la confirmación de reposo. En Ensayos escribe la referencia, ganancias y duración (20 segundos por defecto).
3. Pulsa **Cargar ganancias con motor detenido**. Espera a que lleguen las ganancias confirmadas.
4. Pulsa **Iniciar y registrar prueba**. Se envía un escalón de referencia, se registran los mensajes de la ESP32 y se envía una parada al finalizar.
5. Repite con distintas configuraciones, variando las tres ganancias y la referencia. Parte de las ganancias que ya funcionaron; los máximos de la interfaz NO certifican valores seguros. No se automatiza un barrido de ganancias.
6. Exporta los datos antes de cerrar. El JSON conserva muestras temporales, referencia, RPM procesada/cruda disponible, PWM, ganancias y métricas. Importar recalcula las métricas y evita duplicados por identificador.

Como diseño inicial, prueba tres referencias alcanzables, cuatro combinaciones cercanas a tu PID conocido y tres repeticiones de cada combinación: 36 ensayos. Las cuatro combinaciones deben incluir variación de Kp, Ki y Kd. Si una produce oscilación o funcionamiento inadecuado, detén la prueba y reduce el intervalo. No hay una lista de ganancias garantizadas para este montaje.

Los ensayos con cambios de parámetros, perturbación activada, fallo, referencia inválida o huecos de datos mayores de un segundo no se incorporan al entrenamiento. La tolerancia temporal permite que la última muestra llegue hasta un segundo después de la duración nominal.

## 2. Métricas y costo

- MAE en RPM: integral trapezoidal del error absoluto / duración observada.
- Sobreimpulso en %: máximo exceso positivo sobre la referencia / referencia × 100.
- Tiempo de establecimiento: primera muestra posterior a la última salida de la banda ±máx(2 RPM, 5 % de referencia). Exige al menos dos segundos finales dentro de la banda.
- Si no se establece durante la ventana, Ts queda sin valor; no se inventa un tiempo de establecimiento.

J = 0.50 × MAE/Ref + 0.25 × sobreimpulso/100 + 0.25 × Ts/T + 0.25 × indicador(no establecido).

Si no se establece, Ts/T se sustituye por 1. Los pesos son una elección de diseño, no una ley universal. Se usa la misma definición y duración para todas las pruebas. Menor J significa mejor desempeño según ese criterio, no necesariamente mejor en todo aspecto.

El tiempo se mide en el navegador al recibir los mensajes USB y la RPM es la publicada por el firmware. Por ello la resolución y el filtrado del firmware limitan las métricas, especialmente en transitorios rápidos. El primer tramo anterior a la primera muestra no se interpola como si se hubiese medido.

## 3. Entrenar

La red recibe [referencia, Kp, Ki, Kd]. Posee 8 neuronas ocultas tanh y una salida lineal que predice log(1 + J). La interfaz transforma esa salida a costo no negativo.

Se normalizan las entradas a partir del conjunto de entrenamiento exclusivamente. Se usa descenso de gradiente por lote con tasa 0.02. La gráfica muestra RMSE de costo en entrenamiento y evaluación, mientras el objetivo interno de optimización es el error cuadrático de log(1 + J).

Se reservan aproximadamente 20 % de las configuraciones completas para evaluación. Todas las repeticiones de una configuración permanecen en un solo grupo para evitar que una repetición casi idéntica se use simultáneamente para entrenar y evaluar.

El mínimo de 15 ensayos y 10 configuraciones es una condición operativa; no acredita precisión estadística. Deben variar las cuatro entradas. La interfaz informa MAE, RMSE y R² sobre el costo reservado. Un R² negativo indica que el modelo puede ser peor que predecir el promedio de esos costos; R² no está definido si todos son iguales.

## 4. Buscar y validar

Introduce una referencia y los intervalos de ganancias que hayas comprobado en el equipo. Deben estar dentro de los límites observados en entrenamiento. Se evalúan 4000 candidatos aleatorios reproducibles y se conserva el de menor costo predicho; no se afirma que sea el óptimo global.

**Llevar candidato a Ensayos** copia las ganancias al formulario sin mover el motor. Después debes cargar las ganancias y arrancar la prueba manualmente. Una caja de intervalos puede contener regiones poco muestreadas; estar dentro de ella no garantiza interpolación fiable ni estabilidad.

Compara PID original y candidato usando la misma referencia, duración, alimentación y carga. El panel muestra ambas curvas y las métricas medidas. La reducción porcentual de J es positiva si el candidato fue mejor y negativa si fue peor. Si J original es cero, el porcentaje no se define.

Repite la comparación al menos tres veces y presenta variabilidad, no sólo el mejor ensayo. Conserva una comparación final independiente si reentrenas repetidamente con las nuevas pruebas.

## Entregable académico

Incluye integrantes (máximo dos), descripción del montaje, plan de ensayos, datos exportados, definición de métricas y costo, arquitectura y entrenamiento de la red, error de evaluación, candidato obtenido y comparación experimental repetida. Si no hay mejora, documenta el resultado y sus posibles causas sin sustituirlo por una curva simulada.

## Verificación realizada en software

Pruebas matemáticas: casos conocidos de MAE, sobreimpulso y establecimiento; rechazo de datos incompletos; separación por configuración; gradiente contrastado con diferencias finitas; aprendizaje y búsqueda acotada. Las pruebas automáticas usan datos sintéticos sólo dentro del archivo de test y no los añaden al laboratorio. La operación y la mejora física deben comprobarse en la ESP32 conectada.
