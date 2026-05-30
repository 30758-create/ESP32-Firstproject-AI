#include <Arduino.h>
// กำหนดขา Relay ตาม ESP32DevkitBoard.md
const int RELAY1_PIN = 17;
const int RELAY2_PIN = 16;
const int RELAY3_PIN = 4;

unsigned long previousMillis = 0;
const long interval = 5000;        // 5 วินาที
bool isRelayOn = false;            // สถานะการทำงาน

void setup() {
  // ตั้งค่า Pin เป็น Output
  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(RELAY3_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  // สถานะเริ่มต้น: ปิด Relay ทั้งหมด (Active Low ต้องส่ง HIGH)
  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  digitalWrite(RELAY3_PIN, HIGH);
  digitalWrite(LED_BUILTIN, LOW);
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    
    isRelayOn = !isRelayOn; // สลับสถานะ


    // สั่งงาน Relay (Active Low: LOW = ON, HIGH = OFF)
    int state = isRelayOn ? LOW : HIGH;
    digitalWrite(RELAY1_PIN, state);
    digitalWrite(RELAY2_PIN, state);
    digitalWrite(RELAY3_PIN, state);

    // แสดงสถานะที่ LED บนบอร์ด (LED ติดเมื่อ Relay ทำงาน)
    digitalWrite(LED_BUILTIN, isRelayOn ? HIGH : LOW);
  }
}