#include <Arduino.h>

unsigned long previousMillis = 0; // เก็บเวลาล่าสุดที่มีการสลับสถานะ LED
const long interval = 2000;      // ช่วงเวลาที่ต้องการ (2 วินาที)
int ledState = LOW;              // สถานะปัจจุบันของ LED

void setup() {
 pinMode(LED_BUILTIN, OUTPUT);

}

void loop() {
  unsigned long currentMillis = millis(); // อ่านเวลาปัจจุบัน

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis; // บันทึกเวลาปัจจุบันไว้เป็นเวลาล่าสุด

    ledState = (ledState == LOW) ? HIGH : LOW; // สลับสถานะ LED
    digitalWrite(LED_BUILTIN, ledState);
  }
}