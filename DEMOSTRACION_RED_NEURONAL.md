# Demostración del laboratorio de redes neuronales

Proyecto: Control Inteligente · Rafael Daguer Puello

Abre `red-neuronal.html` desde el enlace «Red neuronal» del simulador. Todo el cálculo ocurre en el navegador. No requiere instalar TensorFlow ni conectar la ESP32.

## Qué implementa

Red densa con dos entradas numéricas, hasta cuatro capas ocultas de una a ocho neuronas y una salida sigmoide. Cada capa oculta admite tanh, ReLU, sigmoide o activación lineal. La salida se mantiene sigmoide porque el problema es clasificación binaria y el coste es entropía cruzada binaria (BCE).

Cada neurona calcula `a = activación(Σ wᵢ aᵢ + b)`. Los pesos controlan la influencia de las entradas; el bias desplaza el umbral de activación. El entrenamiento calcula gradientes por retropropagación y actualiza `θ ← θ − tasa × gradiente`. Usa lote completo: una época es una actualización con todas las observaciones de entrenamiento. No se usan optimizadores adaptativos, regularización ni gradientes del conjunto de evaluación.

## Guion de presentación (8–12 minutos)

1. **AND y OR: fronteras lineales.** Pulsa «1 · AND sin capa oculta» y Entrenar. Explica que una única salida sigmoide puede separar estos datos con una recta. El escenario usa semilla 42, tasa 0,5 y 3000 épocas. Para OR, cambia el problema, carga y entrena. El coste disminuye y los cuatro casos se clasifican correctamente en la prueba de referencia.
2. **XOR y capacidad de la arquitectura.** Pulsa «2 · XOR lineal» y entrena. La frontera recta no puede separar las dos esquinas opuestas de cada clase. El BCE permanece cerca de 0,693. Añadir capas exclusivamente lineales no resuelve esta limitación: su composición sigue siendo lineal antes de la salida sigmoide.
3. **No linealidad.** Pulsa «3 · XOR con tanh» y entrena. Con una capa de cuatro neuronas tanh, la red aprende los cuatro casos con la configuración reproducible propuesta. Selecciona las neuronas para ver diferentes mapas de activación y cómo se combinan. En la prueba automatizada, tras 3000 épocas, el BCE fue aproximadamente 0,00085 y el acierto de ajuste 100 %. No confundir este ajuste de una tabla completa con generalización.
4. **Círculo y anillo.** Pulsa «4 · Círculo y anillo» y entrena. La frontera necesaria es curva. Se generan 240 observaciones, se reserva cerca de 20 % por clase y se muestran ambas curvas de coste. Compara una neurona oculta con ocho y tanh con ReLU, usando igual semilla, tasa y épocas. No todas las arquitecturas o inicializaciones tienen que converger igual.
5. **Tasa y épocas.** Reinicia los pesos con la misma semilla y compara tasas 0,01, 0,1 y 1 durante el mismo número de épocas. Una tasa baja puede requerir más épocas; una alta puede acelerar o desestabilizar. Las épocas no garantizan mejora indefinida ni corrigen una arquitectura incapaz.
6. **Pesos y bias.** Pausa, selecciona una neurona y edita un parámetro. Observa el cambio inmediato de la frontera, de su activación y del coste. La edición reinicia el historial a época cero, conservando los otros parámetros. Así no se presenta una intervención manual como si fuera una actualización del optimizador.
7. **Superficie 3D.** Selecciona dos parámetros distintos, elige el semiancho y pulsa Actualizar corte. Gira la vista con el control. Activa «Entrenar solo los dos parámetros» y avanza una época o entrena. Los demás parámetros quedan constantes: la trayectoria amarilla representa el descenso sobre ese corte. El punto blanco indica la última muestra visible. Si sale del rango, amplía el corte y vuelve a capturar.

## Cómo leer las visualizaciones

- Miniaturas: activaciones al recorrer el plano `(x1, x2)`. En capas ocultas el color se limita visualmente a −1…1; ReLU puede producir valores mayores. En la salida, naranja corresponde a probabilidad 0 y azul a probabilidad 1.
- Conexiones: azul para pesos positivos y naranja para negativos. El grosor aumenta con la magnitud, con un límite gráfico.
- Datos: color = clase real; borde blanco = evaluación, oscuro = entrenamiento.
- Aporte de una neurona: `p_original − p_con_neurona_anulada`. Se anula su activación y se recalculan las capas posteriores. Es una comparación contextual, no una importancia causal ni una suma de contribuciones independientes. Si seleccionas la salida, anularla fija la probabilidad en cero.
- BCE: cuanto menor, mejor ajuste probabilístico en ese conjunto. El porcentaje de acierto aplica umbral 0,5 y no reemplaza al coste.
- Superficie: altura = BCE medio de entrenamiento en una malla 21 × 21. Los ejes A/B son los dos parámetros elegidos, no las entradas x1/x2.

## Distinción esencial sobre la superficie

Una red puede tener decenas de parámetros; el gráfico muestra un corte bidimensional de esa función. Los parámetros restantes se congelan en la instantánea capturada. Si entrenas toda la red, también cambian esos parámetros restantes: por ello la trayectoria A/B se proyecta sobre el corte de referencia y su altura se recalcula en ese corte. Esa altura **no es el coste real histórico**. El coste real histórico se ve en la gráfica de evolución. El modo de entrenar solo dos parámetros permite una demostración exacta de optimización sobre el corte fijo. Una malla finita no demuestra que se haya encontrado un mínimo global.

## Datos personalizados

Selecciona Datos personalizados y escribe entre 4 y 500 filas con tres columnas: `x1,x2,clase`. Las entradas deben estar entre −10 y 10 y las clases ser 0 o 1; debe haber ejemplos de ambas clases. Se admite encabezado `x1,x2,clase`, punto decimal y separador coma, punto y coma o tabulación. No hay normalización automática.

```csv
x1,x2,clase
0,0,0
0,1,1
1,0,1
1,1,0
```

Con al menos cinco ejemplos por clase se hace una división estratificada reproducible (~80/20). Con menos se usa todo para ajustar y se informa que no hay reserva independiente. No cambies semillas repetidamente para seleccionar solo un resultado favorable.

## Validación realizada

Se compararon gradientes analíticos con diferencias finitas para las cuatro activaciones; se verificó aprendizaje en AND, OR, XOR con tanh, clasificación lineal y círculo/anillo; se comprobó la limitación del modelo lineal en XOR, la conservación de parámetros congelados, la anulación de neuronas, la independencia de las instantáneas y la validación de datos. En el navegador se verificaron entrenamiento, edición de arquitectura y parámetros y visualización del corte.

Inspiración visual: [TensorFlow Playground](https://playground.tensorflow.org/). Implementación propia, educativa, sin dependencias externas.
