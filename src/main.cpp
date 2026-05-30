#include <Arduino.h>
#include <WiFi.h>

// ข้อมูลสำหรับเชื่อมต่อ Wi-Fi
const char* ssid = "SOMMAI-2.4G";         // เปลี่ยนเป็นชื่อ Wi-Fi ของคุณ
const char* password = "15032519"; // เปลี่ยนเป็นรหัสผ่าน Wi-Fi ของคุณ

// กำหนดขา Relay ตาม ESP32DevkitBoard.md
const int RELAY1_PIN = 17;
const int RELAY2_PIN = 16;
const int RELAY3_PIN = 4;

// กำหนดขา Switch ตาม ESP32DevkitBoard.md (Active Low + External Pull-up)
const int SW1_PIN = 34;
const int SW2_PIN = 35;
const int SW3_PIN = 32;

// ตัวแปรเก็บสถานะ Relay
bool relay1State = false;
bool relay2State = false;
bool relay3State = false;

// ตัวแปรสำหรับการทำ Debounce
int lastReading1 = HIGH, stableState1 = HIGH;
int lastReading2 = HIGH, stableState2 = HIGH;
int lastReading3 = HIGH, stableState3 = HIGH;
unsigned long lastDebounceTime1 = 0, lastDebounceTime2 = 0, lastDebounceTime3 = 0;
const unsigned long DEBOUNCE_DELAY = 50; // หน่วงเวลา 50ms เพื่อกรองสัญญาณรบกวน

// ฟังก์ชันตัวช่วยสำหรับจัดการการกดสวิตช์และ Toggle Relay
void handleSwitch(int swPin, int &lastReading, int &stableState, unsigned long &lastDebounce, bool &relayState, int relayPin, const char* label) {
  int currentReading = digitalRead(swPin);

  // หากค่าที่อ่านได้เปลี่ยนไป (อาจเป็นการกดจริงหรือสัญญาณรบกวน)
  if (currentReading != lastReading) {
    lastDebounce = millis(); // เริ่มนับเวลาใหม่
  }

  // หากเวลาผ่านไปนานกว่าค่าที่ตั้งไว้ แสดงว่าสัญญาณนิ่งแล้ว
  if ((millis() - lastDebounce) > DEBOUNCE_DELAY) {
    if (currentReading != stableState) {
      stableState = currentReading;

      // ถ้าสถานะใหม่คือ LOW (ถูกกด) ให้ทำการ Toggle
      if (stableState == LOW) {
        relayState = !relayState;
        digitalWrite(relayPin, relayState ? LOW : HIGH); // Active Low: LOW = ON
        Serial.print(label);
        Serial.println(relayState ? " -> ON" : " -> OFF");
      }
    }
  }
  lastReading = currentReading;
}

void setup() {
  Serial.begin(115200);

  // เริ่มการเชื่อมต่อ Wi-Fi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // ตั้งค่าขา Relay เป็น Output
  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(RELAY3_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  // ตั้งค่าขา Switch เป็น Input
  pinMode(SW1_PIN, INPUT);
  pinMode(SW2_PIN, INPUT);
  pinMode(SW3_PIN, INPUT);

  // สถานะเริ่มต้น: ปิด Relay ทั้งหมด (Active Low ต้องส่ง HIGH)
  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  digitalWrite(RELAY3_PIN, HIGH);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.println("System Ready. Control Relays with SW1, SW2, SW3.");
}

void loop() {
  handleSwitch(SW1_PIN, lastReading1, stableState1, lastDebounceTime1, relay1State, RELAY1_PIN, "Relay 1");
  handleSwitch(SW2_PIN, lastReading2, stableState2, lastDebounceTime2, relay2State, RELAY2_PIN, "Relay 2");
  handleSwitch(SW3_PIN, lastReading3, stableState3, lastDebounceTime3, relay3State, RELAY3_PIN, "Relay 3");
}