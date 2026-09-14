#include <Arduino.h>
#include <esp_arduino_version.h>
#include <stdlib.h>
#include <math.h>
#include "PidCore.h"

// IN1 queda a 5 V e IN2 a GND. NO conectarlos a GPIO.
// ENA sin jumper -> GPIO4; encoder via divisor -> GPIO7.
// Potenciometro: extremos a 3V3/GND, cursor a GPIO8.
const uint8_t ENA = 4, ENCODER = 7, POT = 8;
const uint32_t PPR = 40, CONTROL_US = 250000;
// Ganancias iniciales, no sintonizadas con el motor real.
float kp = 0.15f, ki = 0.20f, kd = 0.005f;
float referencia = 0, rpm = 0, rpmCruda = 0, integral = 0, derivada = 0;
float salidaPID = 0, perturbacion = 0;
PidCore controller;
float termP=0, termI=0, termD=0, sumaPID=0;
uint8_t pwm = 0;
bool limiteInferior = false;
bool habilitado = false, fallo = false, potActivo = false;
bool pruebaPWM = false;
uint32_t inicioPrueba = 0;
uint32_t inicioArranque = 0, ultimoControl = 0, ultimoReporte = 0;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t total = 0, ultimoPulso = 0;
// Rechaza solo flancos demasiado proximos al ultimo aceptado; no mide ancho de pulso.
// 20 ranuras: 40 flancos por vuelta. A 500 RPM, intervalo medio 3000 us.
// El ancho de ranura puede variar; 100 us sigue siendo un filtro provisional.
const uint32_t MIN_INTERVALO_US = 100;
volatile uint32_t rechazados = 0;
uint32_t descartadosVentana = 0, descartadosTotal = 0;
float rpmBruta = 0;
float historialRPM[3] = {0, 0, 0};
uint8_t indiceRPM = 0, muestrasRPM = 0;
float filtrarMediana(float valor) {
  historialRPM[indiceRPM] = valor;
  indiceRPM = (indiceRPM + 1) % 3;
  if (muestrasRPM < 3) muestrasRPM++;
  // No introducir ceros artificiales al arrancar.
  if (muestrasRPM < 3) return valor;
  float a = historialRPM[0], b = historialRPM[1], c = historialRPM[2];
  return fmaxf(fminf(a, b), fminf(fmaxf(a, b), c));
}
uint32_t pulsosVentana = 0;
// Limite de diagnostico para este montaje (maximo observado estable < 500 RPM).
const float MAX_RPM_PLAUSIBLE = 1000.0f;
volatile bool hayPulso = false;

void ARDUINO_ISR_ATTR pulso() {
  const uint32_t ahora = micros();
  portENTER_CRITICAL_ISR(&mux);
  if (hayPulso && (uint32_t)(ahora - ultimoPulso) < MIN_INTERVALO_US) {
    rechazados++;
    portEXIT_CRITICAL_ISR(&mux);
    return;
  }

  ultimoPulso = ahora;
  hayPulso = true;
  total++;
  portEXIT_CRITICAL_ISR(&mux);
}

float limitar(float x, float a, float b) { return fminf(b, fmaxf(a, x)); }
void escribirPWM(float x) {
  pwm = habilitado ? (uint8_t)lroundf(limitar(x, 0, 255)) : 0;
  if (!habilitado) return;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  if (!ledcWrite(ENA, pwm)) {
    habilitado = false; fallo = true; pruebaPWM = false; pwm = 0;
    ledcDetach(ENA); pinMode(ENA, OUTPUT); digitalWrite(ENA, LOW);
    Serial.println("ERROR: LEDC rechazo la escritura. Reinicia la placa antes de otra prueba.");
  }
#else
  ledcWrite(0, pwm);
#endif
}
void establecerReferencia(float nueva) {
  pruebaPWM = false;
  if (nueva == 0) {
    controller.reset(); termP=termI=termD=sumaPID=0;
    referencia = 0; limiteInferior = false; fallo = false; integral = 0; derivada = 0; salidaPID = 0;
    escribirPWM(0);
  } else if (fallo || !habilitado) {
    Serial.println("Fallo: revisa motor/encoder. Envia 0 para reconocerlo.");
    return;
  } else {
    if (referencia == 0) {
      inicioArranque = micros(); controller.reset(); integral = 0; derivada = 0;
      portENTER_CRITICAL(&mux);
      hayPulso = false; total = 0; rechazados = 0; ultimoControl = micros();
      portEXIT_CRITICAL(&mux);
      muestrasRPM = 0; indiceRPM = 0; descartadosTotal = 0;
      salidaPID = 0; escribirPWM(0);
    }
    referencia = nueva;
  }
  Serial.print("Referencia RPM: "); Serial.println(referencia);
}

void procesar(char *texto) {
  String s(texto); s.trim(); s.toUpperCase();
  if (!s.length()) return;
  if (s == "TEST") {
    if (!habilitado) { Serial.println("PWM no disponible; reinicia la placa."); return; }
    establecerReferencia(0);
    potActivo = false; perturbacion = 0;
    pruebaPWM = true; inicioPrueba = millis();
    escribirPWM(255);
    Serial.println("TEST: PWM255 durante 1.2 segundos, sin PID. Parada automatica; 0 cancela.");
    return;
  }
  if (s == "POT ON") { potActivo = true; Serial.println("Perturbacion habilitada: 0..60 PWM."); return; }
  if (s == "POT OFF") { potActivo = false; perturbacion = 0; Serial.println("Perturbacion deshabilitada."); return; }
  if (s == "STOP") { establecerReferencia(0); return; }
  char tipo = 0;
  if (s.startsWith("KP ")) { tipo = 'P'; s = s.substring(3); }
  else if (s.startsWith("KI ")) { tipo = 'I'; s = s.substring(3); }
  else if (s.startsWith("KD ")) { tipo = 'D'; s = s.substring(3); }
  s.trim();
  char *fin;
  float valor = strtof(s.c_str(), &fin);
  if (fin == s.c_str() || *fin || !isfinite(valor) || valor < 0 || valor > (tipo ? 10 : 500)) {
    Serial.println("Comando invalido. RPM 0..500; KP/KI/KD 0..10; POT ON/OFF; STOP."); return;
  }
  if (!tipo) { establecerReferencia(valor); return; }
  if (tipo == 'P') kp = valor;
  if (tipo == 'I') { ki = valor; if (ki == 0) controller.reset(); }
  if (tipo == 'D') kd = valor;
  Serial.print("Ganancias: "); Serial.print(kp); Serial.print(", "); Serial.print(ki); Serial.print(", "); Serial.println(kd, 3);
}
void leerSerial() {
  static char buffer[40]; static uint8_t longitud = 0; static bool exceso = false;
  for (int i = 0; i < 64 && Serial.available(); i++) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (exceso) Serial.println("Comando demasiado largo, descartado.");
      else if (longitud) { buffer[longitud] = 0; procesar(buffer); }
      longitud = 0; exceso = false;
    } else if (longitud < sizeof(buffer)-1) buffer[longitud++] = c;
    else exceso = true;
  }
}

void setup() {
  pinMode(ENA, OUTPUT); digitalWrite(ENA, LOW);
  Serial.begin(115200);
  pinMode(ENCODER, INPUT); pinMode(POT, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(POT, ADC_11db);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  habilitado = ledcAttach(ENA, 1000, 8);
#else
  habilitado = ledcSetup(0, 1000, 8) > 0;
  if (habilitado) ledcAttachPin(ENA, 0);
#endif
  escribirPWM(0);
  attachInterrupt(digitalPinToInterrupt(ENCODER), pulso, CHANGE);
  ultimoControl = micros();
  Serial.println("PID v3.0: P + I + D, sin impulso ni PWM minimo. 40 flancos/vuelta, filtro 100us + mediana3 + EMA. Referencia inicial 0 RPM; 0 detiene.");
  Serial.println("POT ON / POT OFF; KP 0.15; KI 0.20; KD 0.005. Monitor a 115200, Nueva linea.");
  if (!habilitado) Serial.println("ERROR PWM. Motor deshabilitado.");
}

void loop() {
  leerSerial();
  if (pruebaPWM && (uint32_t)(millis() - inicioPrueba) >= 1200) {
    pruebaPWM = false; escribirPWM(0);
    Serial.println("TEST terminado. PWM apagado.");
  }
  uint32_t ahora = micros();
  if ((uint32_t)(ahora - ultimoControl) >= CONTROL_US) {
    uint32_t ultimo; bool existe;
    portENTER_CRITICAL(&mux);
    ahora = micros();
    pulsosVentana = total; total = 0;
    descartadosVentana = rechazados; rechazados = 0;
    ultimo = ultimoPulso; existe = hayPulso;
    portEXIT_CRITICAL(&mux);
    const uint32_t duracionUs = (uint32_t)(ahora - ultimoControl);
    const float dt = duracionUs / 1000000.0f;
    ultimoControl = ahora;
    const uint32_t edad = (uint32_t)(micros() - ultimo);
    // Conteo en tiempo real transcurrido: no dividir por intervalos entre flancos.
    rpmCruda = 60000000.0f * pulsosVentana / (PPR * (float)duracionUs);
    descartadosTotal += descartadosVentana;
    rpmBruta = 60000000.0f * ((float)pulsosVentana + descartadosVentana) / (PPR * (float)duracionUs);
    const bool medicionValida = rpmCruda <= MAX_RPM_PLAUSIBLE;
    if (medicionValida) {
      const float previa = rpm;
      const float alfa = dt / (0.15f + dt);
      rpm += alfa * (filtrarMediana(rpmCruda) - rpm);
      if (!existe || edad > 500000) { rpm = 0; muestrasRPM = 0; indiceRPM = 0; }
      derivada += alfa * ((rpm - previa) / dt - derivada);
    }
    perturbacion = potActivo ? analogRead(POT) * (60.0f / 4095.0f) : 0;
    if (pruebaPWM && habilitado) {
      salidaPID = 0; escribirPWM(255);
    } else if (referencia > 0 && !fallo && habilitado) {
      const uint32_t desdeInicio = (uint32_t)(micros() - inicioArranque);
      if (!medicionValida) {
        fallo = true; salidaPID = 0; escribirPWM(0);
        Serial.println("FALLO: conteo supera 1000 RPM. Revisar senal; no es una velocidad validada.");
      } else {
        const PidResult result=controller.step(referencia-rpm, derivada, dt, kp, ki, kd, perturbacion);
        termP=result.p; termI=result.i; termD=result.d; sumaPID=result.sum;
        salidaPID=limitar(sumaPID,0,255);
        limiteInferior=false;
        escribirPWM(result.output);
      }
    } else { termP=termI=termD=sumaPID=0; salidaPID = 0; escribirPWM(0); }
  }
  if ((uint32_t)(millis() - ultimoReporte) >= 250) {
    ultimoReporte = millis();
    Serial.print("V:3 Tms:"); Serial.print(millis());
    Serial.print(" Kp:"); Serial.print(kp,3); Serial.print(" Ki:"); Serial.print(ki,3); Serial.print(" Kd:"); Serial.print(kd,3);
    Serial.print(" P:"); Serial.print(termP,2); Serial.print(" I:"); Serial.print(termI,2); Serial.print(" D:"); Serial.print(termD,2);
    Serial.print(" Suma:"); Serial.print(sumaPID,2); Serial.print(" PotOn:"); Serial.print(potActivo?1:0);
    Serial.print(" Ref:"); Serial.print(referencia, 1);
    Serial.print(" RPM:"); Serial.print(rpm, 1);
    Serial.print(" Cruda:"); Serial.print(rpmCruda, 1);
    Serial.print(" Bruta:"); Serial.print(rpmBruta, 1);
    Serial.print(" Desc250:"); Serial.print(descartadosVentana);
    Serial.print(" DescTotal:"); Serial.print(descartadosTotal);
    Serial.print(" N250:"); Serial.print(pulsosVentana);
    Serial.print(" PID:"); Serial.print(salidaPID, 1);
    Serial.print(" Pert:"); Serial.print(perturbacion, 1);
    Serial.print(" PWM:"); Serial.print(pwm);
    Serial.print(" Minimo:"); Serial.print(referencia > 0 && !fallo && !pruebaPWM && limiteInferior ? 1 : 0);
    Serial.print(" Estado:"); Serial.println(fallo ? "FALLO" : pruebaPWM ? "TEST" : referencia == 0 ? "PARADO" : "ACTIVO");
  }
}







