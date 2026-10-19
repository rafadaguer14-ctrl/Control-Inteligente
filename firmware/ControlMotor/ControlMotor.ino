#include <Arduino.h>
#include <esp_arduino_version.h>
#include <stdlib.h>
#include <math.h>
#include <math.h>
// Same 25-rule zero-order Sugeno system as fuzzy-core.js.
class FuzzyCore {
  float duty=0;
public:
  float errorNorm=0, rateNorm=0, z=0;
  static float clamp(float v,float lo,float hi){return fminf(hi,fmaxf(lo,v));}
  void reset(){duty=0;errorNorm=rateNorm=z=0;}
  static float infer(float e,float de){
    const float c[5]={-1,-.5f,0,.5f,1};
    e=clamp(e,-1,1);de=clamp(de,-1,1);
    float sum=0,weights=0;
    for(int i=0;i<5;i++)for(int j=0;j<5;j++){
      float w=fmaxf(0,1-fabsf(e-c[i])/.5f)*fmaxf(0,1-fabsf(de-c[j])/.5f);
      sum+=w*clamp(c[i]+c[j],-1,1);weights+=w;
    }
    return weights>0?sum/weights:0;
  }
  float step(float error,float speedDerivative,float dt,float errorScale,float rateScale,float gain,float disturbance){
    errorNorm=clamp(error/errorScale,-1,1);
    // Derivative on filtered measurement avoids a kick on reference changes.
    rateNorm=clamp(-speedDerivative/rateScale,-1,1);
    z=infer(errorNorm,rateNorm);
    duty=clamp(duty+z*(gain/100)*dt,0,1);
    return clamp(duty*255-disturbance,0,255);
  }
  float command()const{return duty*255;}
};

struct PidResult { float p,i,d,sum,output; };
class PidCore {
  float errorIntegral=0;
public:
  void reset(){errorIntegral=0;}
  PidResult step(float error,float measurementDerivative,float dt,float kp,float ki,float kd,float disturbance){
    PidResult r{kp*error,0,-kd*measurementDerivative,0,0};
    if(ki==0) errorIntegral=0;
    else {
      const float delta=error*dt;
      const float candidate=errorIntegral+delta;
      const float requested=r.p+ki*candidate+r.d-disturbance;
      // Conditional integration: block only increments driving saturation farther.
      if(!((requested>255 && ki*delta>0)||(requested<0 && ki*delta<0))) errorIntegral=candidate;
    }
    r.i=ki*errorIntegral;
    r.sum=r.p+r.i+r.d;
    const float effective=r.sum-disturbance;
    r.output=effective<0?0:effective>255?255:effective;
    return r;
  }
};


// IN1 queda a 5 V e IN2 a GND. NO conectarlos a GPIO.
// ENA sin jumper -> GPIO4; encoder via divisor -> GPIO7.
// Potenciometro: extremos a 3V3/GND, cursor a GPIO8.
const uint8_t ENA = 4, ENCODER = 7, POT = 8;
const uint32_t PPR = 40, CONTROL_US = 250000;
// Ganancias iniciales, no sintonizadas con el motor real.
float errorScale = 100, rateScale = 200, gain = 30;
uint32_t lastHeartbeat=0;
bool linked=false;
float referencia = 0, rpm = 0, rpmCruda = 0, integral = 0, derivada = 0;
float salidaFuzzy = 0, perturbacion = 0;
FuzzyCore fuzzyController;
PidCore pidController;
float kp=.15f,ki=.20f,kd=.005f;
float termP=0,termI=0,termD=0,sumaPID=0;
// 0 = no interface selected; 1 = PID; 2 = Fuzzy.
uint8_t mode=0;
const char* modeName(){return mode==1?"PID":mode==2?"FUZZY":"NONE";}

uint8_t pwm = 0;
bool limiteInferior = false;
bool habilitado = false, fallo = false, potActivo = false;
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
    habilitado = false; fallo = true; pwm = 0;
    ledcDetach(ENA); pinMode(ENA, OUTPUT); digitalWrite(ENA, LOW);
    Serial.println("ERROR: LEDC rechazo la escritura. Reinicia la placa antes de otra prueba.");
  }
#else
  ledcWrite(0, pwm);
#endif
}
void establecerReferencia(float nueva) {
 
  if (nueva == 0) {
    fuzzyController.reset(); pidController.reset(); termP=termI=termD=sumaPID=0; 
    referencia = 0; limiteInferior = false; fallo = false; integral = 0; derivada = 0; salidaFuzzy = 0;
    escribirPWM(0);
  } else if (fallo || !habilitado || !linked || mode==0) {
    Serial.println("Fallo: revisa conexion/motor/encoder. Envia 0 para reconocerlo.");
    return;
  } else {
    if (referencia == 0) {
      inicioArranque = micros(); fuzzyController.reset(); pidController.reset(); termP=termI=termD=sumaPID=0; integral = 0; derivada = 0;
      portENTER_CRITICAL(&mux);
      hayPulso = false; total = 0; rechazados = 0; ultimoControl = micros();
      portEXIT_CRITICAL(&mux);
      muestrasRPM = 0; indiceRPM = 0; descartadosTotal = 0;
      salidaFuzzy = 0; escribirPWM(0);
    }
    referencia = nueva;
  }
  Serial.print("Referencia RPM: "); Serial.println(referencia);
}

void procesar(char *texto) {
  String s(texto); s.trim(); s.toUpperCase();
  if (!s.length()) return;
  if(s=="MODE PID" || s=="MODE FUZZY"){
    establecerReferencia(0);
    potActivo=false;perturbacion=0;
    mode=s=="MODE PID"?1:2;lastHeartbeat=millis();linked=true;
    Serial.print("Seleccionado: ");Serial.println(modeName());return;
  }
  if(s=="PING PID" || s=="PING FUZZY"){
    if((mode==1 && s=="PING PID")||(mode==2 && s=="PING FUZZY")){lastHeartbeat=millis();linked=true;}
    return;
  }
  if (s == "POT ON") { potActivo = true; Serial.println("Perturbacion habilitada: 0..60 PWM."); return; }
  if (s == "POT OFF") { potActivo = false; perturbacion = 0; Serial.println("Perturbacion deshabilitada."); return; }
  if (s == "STOP") { establecerReferencia(0); return; }
  // PID parameters are accepted only while the PID interface owns the mode.
  if(s.startsWith("KP ")||s.startsWith("KI ")||s.startsWith("KD ")){
    if(mode!=1){Serial.println("ERROR: modo PID no seleccionado.");return;}
    char kind=s.charAt(1);String number=s.substring(3);number.trim();char* end;
    float value=strtof(number.c_str(),&end);
    if(end==number.c_str()||*end||!isfinite(value)||value<0||value>10){Serial.println("ERROR: ganancia invalida.");return;}
    if(kind=='P')kp=value;
    if(kind=='I'){ki=value;if(ki==0)pidController.reset();}
    if(kind=='D')kd=value;
    return;
  }
  char tipo = 0;
  if (s.startsWith("ES ")) { tipo = 'P'; s = s.substring(3); }
  else if (s.startsWith("DS ")) { tipo = 'I'; s = s.substring(3); }
  else if (s.startsWith("GS ")) { tipo = 'D'; s = s.substring(3); }
  if(tipo && mode!=2){Serial.println("ERROR: modo Fuzzy no seleccionado.");return;}
  s.trim();
  char *fin;
  float valor = strtof(s.c_str(), &fin);
  if (fin == s.c_str() || *fin || !isfinite(valor) || valor < (tipo == 'P' ? 10 : tipo == 'I' ? 20 : 0) || valor > (tipo == 'P' ? 200 : tipo == 'I' ? 500 : tipo == 'D' ? 100 : 200)) {
    Serial.println("Comando invalido. RPM 0..200; ES 10..200; DS 20..500; GS 0..100; POT ON/OFF; STOP."); return;
  }
  if (!tipo) { establecerReferencia(valor); return; }
  if(tipo=='P') errorScale=valor;
  if(tipo=='I') rateScale=valor;
  if(tipo=='D') gain=valor;
  Serial.println("Parametros Fuzzy actualizados.");
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
  Serial.println("ControlMotor v5: PID + Fuzzy seleccionados por interfaz. 40 flancos/vuelta, filtro 100us + mediana3 + EMA. Referencia inicial 0 RPM.");
  Serial.println("MODE PID / MODE FUZZY; PING PID / PING FUZZY cada segundo. STOP. Serial 115200.");
  if (!habilitado) Serial.println("ERROR PWM. Motor deshabilitado.");
}

void loop() {
  leerSerial();
  if(linked && (uint32_t)(millis()-lastHeartbeat)>3000){
    linked=false;establecerReferencia(0);mode=0;fallo=true;
    Serial.println("FALLO: enlace sin latido durante 3 s. Salida apagada; envia 0.");
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
    if (referencia > 0 && !fallo && habilitado) {
      const uint32_t desdeInicio = (uint32_t)(micros() - inicioArranque);
      if (!medicionValida) {
        fallo = true; salidaFuzzy = 0; escribirPWM(0);
        Serial.println("FALLO: conteo supera 1000 RPM. Revisar senal; no es una velocidad validada.");
      } else {
        if(mode==1){
          const PidResult r=pidController.step(referencia-rpm,derivada,dt,kp,ki,kd,perturbacion);
          termP=r.p;termI=r.i;termD=r.d;sumaPID=r.sum;
          salidaFuzzy=limitar(r.sum,0,255);escribirPWM(r.output);
        } else if(mode==2){
          const float output=fuzzyController.step(referencia-rpm,derivada,dt,errorScale,rateScale,gain,perturbacion);
          salidaFuzzy=fuzzyController.command();escribirPWM(output);
        } else {escribirPWM(0);}
      }
    } else {  salidaFuzzy = 0; escribirPWM(0); }
  }
  if ((uint32_t)(millis() - ultimoReporte) >= 250) {
    ultimoReporte = millis();
    Serial.print("V:5 Mode:");Serial.print(modeName());Serial.print(" Tms:"); Serial.print(millis());
    Serial.print(" Kp:");Serial.print(kp,3);Serial.print(" Ki:");Serial.print(ki,3);Serial.print(" Kd:");Serial.print(kd,3);
    Serial.print(" P:");Serial.print(termP,3);Serial.print(" I:");Serial.print(termI,3);Serial.print(" D:");Serial.print(termD,3);
    Serial.print(" Suma:");Serial.print(sumaPID,3);Serial.print(" PID:");Serial.print(salidaFuzzy,2);
    Serial.print(" ES:"); Serial.print(errorScale,3);
    Serial.print(" DS:"); Serial.print(rateScale,3);
    Serial.print(" GS:"); Serial.print(gain,3);
    Serial.print(" EN:"); Serial.print(fuzzyController.errorNorm,3);
    Serial.print(" DEN:"); Serial.print(fuzzyController.rateNorm,3);
    Serial.print(" Z:"); Serial.print(fuzzyController.z,3);
    Serial.print(" Cmd:"); Serial.print(salidaFuzzy,2);
    Serial.print(" PotOn:"); Serial.print(potActivo?1:0);
    Serial.print(" Ref:"); Serial.print(referencia, 1);
    Serial.print(" RPM:"); Serial.print(rpm, 1);
    Serial.print(" Cruda:"); Serial.print(rpmCruda, 1);
    Serial.print(" Bruta:"); Serial.print(rpmBruta, 1);
    Serial.print(" Desc250:"); Serial.print(descartadosVentana);
    Serial.print(" DescTotal:"); Serial.print(descartadosTotal);
    Serial.print(" N250:"); Serial.print(pulsosVentana);
    Serial.print(" Fuzzy:"); Serial.print(salidaFuzzy, 1);
    Serial.print(" Pert:"); Serial.print(perturbacion, 1);
    Serial.print(" PWM:"); Serial.print(pwm);
    Serial.print(" Minimo:"); Serial.print(referencia > 0 && !fallo && limiteInferior ? 1 : 0);
    Serial.print(" Estado:"); Serial.println(fallo ? "FALLO" : referencia == 0 ? "PARADO" : "ACTIVO");
  }
}







