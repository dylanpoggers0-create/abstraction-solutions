/*
  Hydroponic Cart - sensor reader (Abstraction Solutions)
  Board: Elegoo Mega 2560

  Reads only, controls nothing. Every 5 seconds it prints one line of JSON over USB,
  which the laptop app (app/hydro_app.py) saves and turns into suggestions.

  Wiring (as built):
    Water strip #1 (backup tank, up top):     S -> A0,  + -> D24,  - -> GND
    Water strip #2 (plant tank):             S -> A1,  + -> D25,  - -> GND
    DHT11 #1 (tower top, drip zone):         S -> D26, middle -> 5V, right -> GND
    DHT11 #2 (ambient, up top):              S -> D27, middle -> 5V, right -> GND
    pH board:                                Po -> A2, V+ -> 5V, both G -> GND

  Library: "DHT sensor library" by Adafruit (Tools -> Manage Libraries)
  Serial: 115200 baud
*/

#include <DHT.h>

const uint8_t STRIP_SIG[2] = {A0, A1};
const uint8_t STRIP_PWR[2] = {24, 25};
const uint8_t PH_PIN = A2;

DHT dhtTop(26, DHT11);
DHT dhtLow(27, DHT11);

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(STRIP_PWR[i], OUTPUT);
    digitalWrite(STRIP_PWR[i], LOW);   // strips stay off between readings (no corrosion)
  }
  dhtTop.begin();
  dhtLow.begin();
}

int readStrip(uint8_t i) {
  digitalWrite(STRIP_PWR[i], HIGH);
  delay(10);
  int v = analogRead(STRIP_SIG[i]);
  digitalWrite(STRIP_PWR[i], LOW);
  return v;
}

// average 40 samples: the pH signal is small and noisy
float readPhVolts() {
  long sum = 0;
  for (uint8_t i = 0; i < 40; i++) {
    sum += analogRead(PH_PIN);
    delay(5);
  }
  return sum / 40.0 * 5.0 / 1023.0;
}

void printNum(const char* key, float v, uint8_t digits) {
  Serial.print('"'); Serial.print(key); Serial.print("\":");
  if (isnan(v)) Serial.print("null");
  else Serial.print(v, digits);
}

void loop() {
  float tTop = dhtTop.readTemperature();
  float hTop = dhtTop.readHumidity();
  float tLow = dhtLow.readTemperature();
  float hLow = dhtLow.readHumidity();
  int water = readStrip(0);
  int nutr = readStrip(1);
  float phV = readPhVolts();

  // one JSON object per line, e.g. {"t_top":24.0,"h_top":55,...}
  Serial.print('{');
  printNum("t_top", tTop, 1);  Serial.print(',');
  printNum("h_top", hTop, 0);  Serial.print(',');
  printNum("t_low", tLow, 1);  Serial.print(',');
  printNum("h_low", hLow, 0);  Serial.print(',');
  Serial.print("\"strip_water\":"); Serial.print(water); Serial.print(',');
  Serial.print("\"strip_nutr\":");  Serial.print(nutr);  Serial.print(',');
  printNum("ph_volts", phV, 3);
  Serial.println('}');

  delay(5000);
}
