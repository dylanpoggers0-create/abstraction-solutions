/*
  Hydroponic Cart - sensor logger (Abstraction Solutions)
  Board: Elegoo Mega 2560

  Reads only, controls nothing. Works two ways at once:
    1. LIVE: every 5 seconds it prints one line of JSON over USB for the laptop app (app/hydro_app.py).
    2. LOGGER: it also saves a 10-minute average of every sensor in its own memory (EEPROM, which keeps
       its contents with the power off). That's 372 readings: about 2.6 days. Power it from any USB phone
       charger and it records on its own; when you plug in the laptop and run the app, the app downloads
       everything saved, then clears the memory. When the memory is full, the oldest readings are replaced.

  Wiring (as built):
    Water strip #1 (backup tank, up top):     S -> A0,  + -> D24,  - -> GND
    Water strip #2 (plant tank):             S -> A1,  + -> D25,  - -> GND
    DHT11 #1 (tower top, drip zone):         S -> D26, middle -> 5V, right -> GND
    DHT11 #2 (ambient, up top):              S -> D27, middle -> 5V, right -> GND
    pH board:                                Po -> A2, V+ -> 5V, both G -> GND

  Library: "DHT sensor library" by Adafruit (Tools -> Manage Libraries)
  Serial: 115200 baud. Commands the app can send (one per line):
    DUMP      print every saved reading
    CLEAR     forget the saved readings (the app does this after it has stored them safely)
    INT n     save every n minutes (5, 10, 15 or 30; default 10)
*/

#include <DHT.h>
#include <EEPROM.h>

const uint8_t STRIP_SIG[2] = {A0, A1};
const uint8_t STRIP_PWR[2] = {24, 25};
const uint8_t PH_PIN = A2;

DHT dhtTop(26, DHT11);
DHT dhtLow(27, DHT11);

// ---------------- memory layout (EEPROM, 4096 bytes on the Mega) ----------------
const uint16_t MAGIC = 0x4843;        // "HC": the memory has been set up by this program
const uint8_t  VERSION = 2;
const int H_MAGIC = 0;                // 2 bytes
const int H_VER = 2;                  // 1 byte
const int H_INT = 3;                  // 1 byte: minutes between saved readings
const int H_BOOT = 4;                 // 2 bytes: how many times the board has started
// "state marks": every minute, and after every saved reading, the board writes
//   (boot, seconds running, where the next reading goes, how many are saved)
// into the next of 32 rotating slots. After a restart the newest mark says exactly when the previous run ended
// and where the saved readings are. Rotating through 32 slots spreads the wear (EEPROM cells last ~100,000
// writes each), so the memory lasts many years of 24/7 use.
const int MARK_BASE = 16;
const uint8_t MARK_SLOTS = 32;
const uint8_t MARK_SIZE = 11;         // boot (2) + seconds (4) + head (2) + count (2) + checksum (1)
const int REC_BASE = MARK_BASE + MARK_SLOTS * MARK_SIZE;   // 368
const uint8_t REC_SIZE = 10;
uint16_t recMax;                      // (4096 - 368) / 10 = 372 readings

// one saved reading (10 bytes):
//   bytes 0-1  boot (3 bits) + interval number since that boot (13 bits)
//   bytes 2-3  pH board voltage in millivolts (-1 = no reading)
//   byte  4    tower-top temperature x2 (signed; -128 = no reading)
//   byte  5    tower-top humidity x2 (255 = no reading)
//   byte  6    room temperature x2, byte 7 room humidity x2
//   byte  8    backup-tank strip / 4 (255 = no reading), byte 9 plant-tank strip / 4

uint16_t bootCount;
uint8_t intervalMin = 10;
int32_t prevAliveS = -1;              // seconds the previous run lasted, to within a minute (-1 = unknown)
uint16_t head = 0, count = 0;         // where the next reading goes, and how many are saved
uint32_t uptimeS = 0;                 // seconds since this start (doesn't roll over like millis())
uint32_t lastMs = 0;
uint32_t nextLiveS = 0, nextAliveS = 60;
uint16_t tick = 0;                    // readings saved since this start
uint8_t markIdx = 0;

// sums for the current 10-minute average
float sumPh, sumTT, sumHT, sumTL, sumHL, sumSW, sumSN;
uint16_t nPh, nTT, nHT, nTL, nHL, nSW, nSN;

char cmd[24];
uint8_t cmdLen = 0;

uint16_t readU16(int a) { return EEPROM.read(a) | (EEPROM.read(a + 1) << 8); }
void writeU16(int a, uint16_t v) { EEPROM.update(a, v & 0xFF); EEPROM.update(a + 1, v >> 8); }
uint32_t readU32(int a) { return (uint32_t)readU16(a) | ((uint32_t)readU16(a + 2) << 16); }
void writeU32(int a, uint32_t v) { writeU16(a, v & 0xFFFF); writeU16(a + 2, v >> 16); }

void resetSums() {
  sumPh = sumTT = sumHT = sumTL = sumHL = sumSW = sumSN = 0;
  nPh = nTT = nHT = nTL = nHL = nSW = nSN = 0;
}

uint8_t markSum(int a) {              // checksum of a state mark's 10 bytes
  uint8_t c = 0xA5;
  for (uint8_t i = 0; i < 10; i++) c = (c << 1 | c >> 7) ^ EEPROM.read(a + i);
  return c;
}

void setupMemory() {
  recMax = (EEPROM.length() - REC_BASE) / REC_SIZE;
  if (readU16(H_MAGIC) != MAGIC || EEPROM.read(H_VER) != VERSION) {   // first run: set the memory up
    writeU16(H_MAGIC, MAGIC);
    EEPROM.update(H_VER, VERSION);
    EEPROM.update(H_INT, 10);
    writeU16(H_BOOT, 0);
    for (uint8_t i = 0; i < MARK_SLOTS; i++) EEPROM.update(MARK_BASE + i * MARK_SIZE + 10, 0x5A);   // bad checksum = empty
  }
  intervalMin = EEPROM.read(H_INT);
  if (intervalMin != 5 && intervalMin != 10 && intervalMin != 15 && intervalMin != 30) intervalMin = 10;

  // the newest state mark (highest boot, then most seconds) has the saved readings' position
  uint16_t prevBoot = readU16(H_BOOT);
  int best = -1; uint16_t bestBoot = 0; uint32_t bestUp = 0;
  for (uint8_t i = 0; i < MARK_SLOTS; i++) {
    int a = MARK_BASE + i * MARK_SIZE;
    uint16_t b = readU16(a);
    if (markSum(a) != EEPROM.read(a + 10) || b > prevBoot) continue;   // empty, or cut off mid-write
    uint32_t u = readU32(a + 2);
    if (best < 0 || b > bestBoot || (b == bestBoot && u >= bestUp)) { best = i; bestBoot = b; bestUp = u; }
  }
  if (best >= 0) {
    int a = MARK_BASE + best * MARK_SIZE;
    head = readU16(a + 6) % recMax;
    count = min(readU16(a + 8), recMax);
    markIdx = (best + 1) % MARK_SLOTS;
    if (bestBoot == prevBoot) prevAliveS = bestUp;
  }
  bootCount = prevBoot + 1;
  writeU16(H_BOOT, bootCount);
}

void markState() {
  int a = MARK_BASE + markIdx * MARK_SIZE;
  writeU16(a, bootCount);             // EEPROM.update only rewrites bytes that changed, which saves wear
  writeU32(a + 2, uptimeS);
  writeU16(a + 6, head);
  writeU16(a + 8, count);
  EEPROM.update(a + 10, markSum(a));  // written last: a power cut mid-write leaves a bad checksum, so it's ignored
  markIdx = (markIdx + 1) % MARK_SLOTS;
}

void saveReading() {
  uint8_t r[REC_SIZE];
  uint16_t bt = ((bootCount & 0x07) << 13) | (tick & 0x1FFF);
  int16_t mv = nPh ? (int16_t)(sumPh / nPh * 1000.0 + 0.5) : -1;
  r[0] = bt & 0xFF;  r[1] = bt >> 8;
  r[2] = mv & 0xFF;  r[3] = (uint16_t)mv >> 8;
  r[4] = nTT ? (int8_t)constrain(round(sumTT / nTT * 2), -127, 127) : (int8_t)-128;
  r[5] = nHT ? (uint8_t)constrain(round(sumHT / nHT * 2), 0, 254) : 255;
  r[6] = nTL ? (int8_t)constrain(round(sumTL / nTL * 2), -127, 127) : (int8_t)-128;
  r[7] = nHL ? (uint8_t)constrain(round(sumHL / nHL * 2), 0, 254) : 255;
  r[8] = nSW ? (uint8_t)constrain(round(sumSW / nSW / 4), 0, 254) : 255;
  r[9] = nSN ? (uint8_t)constrain(round(sumSN / nSN / 4), 0, 254) : 255;

  for (uint8_t i = 0; i < REC_SIZE; i++) EEPROM.update(REC_BASE + head * REC_SIZE + i, r[i]);
  head = (head + 1) % recMax;
  if (count < recMax) count++;
  tick++;
  resetSums();
  markState();
}

void dump() {
  Serial.print(F("{\"dump\":\"start\",\"n\":")); Serial.print(count); Serial.println('}');
  uint16_t start = (head + recMax - count) % recMax;      // oldest first
  for (uint16_t j = 0; j < count; j++) {
    int base = REC_BASE + ((start + j) % recMax) * REC_SIZE;
    uint16_t bt = readU16(base);
    Serial.print(F("{\"r\":["));
    Serial.print(bt >> 13); Serial.print(',');
    Serial.print(bt & 0x1FFF); Serial.print(',');
    Serial.print((int16_t)readU16(base + 2)); Serial.print(',');
    Serial.print((int8_t)EEPROM.read(base + 4)); Serial.print(',');
    Serial.print(EEPROM.read(base + 5)); Serial.print(',');
    Serial.print((int8_t)EEPROM.read(base + 6)); Serial.print(',');
    Serial.print(EEPROM.read(base + 7)); Serial.print(',');
    Serial.print(EEPROM.read(base + 8)); Serial.print(',');
    Serial.print(EEPROM.read(base + 9));
    Serial.println(F("]}"));
  }
  Serial.print(F("{\"dump\":\"end\",\"boot\":")); Serial.print(bootCount);
  Serial.print(F(",\"up\":")); Serial.print(uptimeS);
  Serial.print(F(",\"int\":")); Serial.print(intervalMin * 60);
  Serial.print(F(",\"prev_alive_s\":")); Serial.print(prevAliveS);
  Serial.print(F(",\"n\":")); Serial.print(count);
  Serial.println('}');
}

void handleCommand() {
  cmd[cmdLen] = 0;
  if (strcmp(cmd, "DUMP") == 0) {
    dump();
  } else if (strcmp(cmd, "CLEAR") == 0) {
    count = 0;
    markState();
    Serial.println(F("{\"cleared\":true}"));
  } else if (strncmp(cmd, "INT ", 4) == 0) {
    int n = atoi(cmd + 4);
    if (n == 5 || n == 10 || n == 15 || n == 30) {
      EEPROM.update(H_INT, n);
      Serial.println(F("{\"int_set\":true,\"note\":\"takes effect after a restart\"}"));
    } else {
      Serial.println(F("{\"int_set\":false}"));
    }
  }
  cmdLen = 0;
}

void readCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (cmdLen) handleCommand(); }
    else if (cmdLen < sizeof(cmd) - 1) cmd[cmdLen++] = c;
  }
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

void add(float v, float &sum, uint16_t &n) { if (!isnan(v)) { sum += v; n++; } }

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(STRIP_PWR[i], OUTPUT);
    digitalWrite(STRIP_PWR[i], LOW);   // strips stay off between readings (no corrosion)
  }
  dhtTop.begin();
  dhtLow.begin();
  setupMemory();
  resetSums();
  lastMs = millis();
}

void loop() {
  uint32_t now = millis();
  while (now - lastMs >= 1000) { uptimeS++; lastMs += 1000; }
  readCommands();

  if (uptimeS >= nextLiveS) {
    nextLiveS = uptimeS + 5;
    float tTop = dhtTop.readTemperature();
    float hTop = dhtTop.readHumidity();
    float tLow = dhtLow.readTemperature();
    float hLow = dhtLow.readHumidity();
    int water = readStrip(0);
    int nutr = readStrip(1);
    float phV = readPhVolts();
    add(tTop, sumTT, nTT); add(hTop, sumHT, nHT); add(tLow, sumTL, nTL); add(hLow, sumHL, nHL);
    add(water, sumSW, nSW); add(nutr, sumSN, nSN); add(phV, sumPh, nPh);

    // one JSON object per line, e.g. {"t_top":24.0,"h_top":55,...}
    Serial.print('{');
    printNum("t_top", tTop, 1);  Serial.print(',');
    printNum("h_top", hTop, 0);  Serial.print(',');
    printNum("t_low", tLow, 1);  Serial.print(',');
    printNum("h_low", hLow, 0);  Serial.print(',');
    Serial.print("\"strip_water\":"); Serial.print(water); Serial.print(',');
    Serial.print("\"strip_nutr\":");  Serial.print(nutr);  Serial.print(',');
    printNum("ph_volts", phV, 3);    Serial.print(',');
    Serial.print("\"boot\":"); Serial.print(bootCount); Serial.print(',');
    Serial.print("\"up\":"); Serial.print(uptimeS); Serial.print(',');
    Serial.print("\"saved\":"); Serial.print(count);
    Serial.println('}');
  }

  if (uptimeS >= (uint32_t)(tick + 1) * intervalMin * 60UL) saveReading();   // reading k covers [k, k+1) intervals
  if (uptimeS >= nextAliveS) { nextAliveS = uptimeS + 60; markState(); }
}
