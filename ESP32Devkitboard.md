# รายละเอียดบอร์ด ESP32 Devkit

บอร์ดไมโครคอนโทรลเลอร์ประสิทธิภาพสูงที่ใช้ชิป **ESP32-WROOM-32** รองรับการเชื่อมต่อไร้สายครบถ้วนในตัวเดียว เหมาะสำหรับการพัฒนาอุปกรณ์ IoT

## ข้อมูลจำเพาะทางเทคนิค (Technical Specifications)

*   **ชิปหลัก:** ESP32-D0WDQ6 (Dual-core 32-bit LX6 Microprocessor)
*   **ความเร็วสัญญาณนาฬิกา:** สูงสุด 240 MHz
*   **หน่วยความจำ (RAM):** 520 KB SRAM
*   **หน่วยความจำ Flash:** 4 MB (Standard)
*   **การเชื่อมต่อไร้สาย:**
    *   **Wi-Fi:** 802.11 b/g/n (สูงสุด 150 Mbps)
    *   **Bluetooth:** v4.2 BR/EDR และ BLE (Bluetooth Low Energy)

## พอร์ตและการเชื่อมต่อ (I/O Peripherals)

*   **GPIO:** 30 ถึง 38 ขา (ขึ้นอยู่กับรุ่นของบอร์ด)
*   **Analog Input (ADC):** 12-bit ความละเอียดสูง (18 ช่อง)
*   **Analog Output (DAC):** 8-bit (2 ช่อง)
*   **การสื่อสาร:**
    *   UART: 3 พอร์ต
    *   SPI: 3 พอร์ต
    *   I2C: 2 พอร์ต
*   **เซนเซอร์ในตัว:** เซนเซอร์สัมผัส (Capacitive Touch), Hall Effect Sensor และเซนเซอร์อุณหภูมิภายในชิป

## พลังงาน (Power Management)

*   **แรงดันใช้งาน (Operating Voltage):** 3.3V
*   **แรงดันขาเข้า (Input Voltage):** 5V ผ่านพอร์ต USB หรือขา Vin
*   **กระแสไฟฟ้า:** แนะนำให้ใช้แหล่งจ่ายที่จ่ายกระแสได้อย่างน้อย 500mA (เนื่องจากช่วงรับ-ส่ง Wi-Fi ใช้กระแสสูง)

## ข้อมูลจำเพาะสำหรับรุ่น DOIT Devkit V1
ตามการตั้งค่าใน `platformio.ini` ของคุณ:
*   **Board ID:** `esp32doit-devkit-v1`
*   **LED ภายใน:** เชื่อมต่อกับขา **GPIO 2** (หรือนิยามในโค้ดว่า `LED_BUILTIN`)

## การเชื่อมต่อ Relay (Active Low)

รายละเอียดการกำหนดขา GPIO สำหรับควบคุม Module Relay:

| อุปกรณ์ | ขา GPIO | โหมดการทำงาน | สถานะเริ่มต้น (แนะนำ) |
| :--- | :---: | :--- | :--- |
| **Relay 1** | GPIO 17 | Active Low | HIGH (OFF) |
| **Relay 2** | GPIO 16 | Active Low | HIGH (OFF) |
| **Relay 3** | GPIO 4 | Active Low | HIGH (OFF) |

### หลักการทำงานแบบ Active Low
1.  **สั่งเปิด (ON):** ส่งสัญญาณ `LOW` (0) ไปที่ขา GPIO
    *   `digitalWrite(PIN, LOW);`
2.  **สั่งปิด (OFF):** ส่งสัญญาณ `HIGH` (1) ไปที่ขา GPIO
    *   `digitalWrite(PIN, HIGH);`

---
*ข้อควรระวัง: ขาของ ESP32 ส่วนใหญ่ทำงานที่ระดับแรงดัน 3.3V เท่านั้น การนำแรงดัน 5V มาต่อเข้าขา GPIO โดยตรงอาจทำให้ชิปเสียหายได้*

## การเชื่อมต่อ Switch (Active Low)

รายละเอียดการกำหนดขา GPIO สำหรับ Switch พร้อม External Pull-up:

| อุปกรณ์ | ขา GPIO | โหมดการทำงาน | หมายเหตุ |
| :--- | :---: | :--- | :--- |
| **SW 1** | GPIO 34 | Active Low | External Pull-up |
| **SW 2** | GPIO 35 | Active Low | External Pull-up |
| **SW 3** | GPIO 32 | Active Low | External Pull-up |

### หลักการทำงานของ Switch
1.  **สถานะกด (Pressed):** สัญญาณจะเป็น `LOW` (0)
2.  **สถานะปล่อย (Released):** สัญญาณจะเป็น `HIGH` (1) เนื่องจากมี External Pull-up ดึงแรงดันไว้
## การเชื่อมต่อ OLED 0.96 นิ้ว แบบ I2C

OLED 0.96 นิ้ว แบบ I2C ที่ใช้กับ ESP32 Devkit ส่วนใหญ่เป็นจอความละเอียด `128x64` พิกเซล ใช้ชิปควบคุม `SSD1306` และสื่อสารผ่านบัส I2C จึงใช้สายสัญญาณเพียง 2 เส้นคือ `SDA` และ `SCL`

### ขาที่แนะนำสำหรับ ESP32 Devkit

| ขา OLED I2C | ต่อกับ ESP32 Devkit | รายละเอียด |
| :--- | :---: | :--- |
| `VCC` | `3V3` | แนะนำให้ใช้ไฟ 3.3V เพื่อให้ระดับสัญญาณเข้ากับ ESP32 |
| `GND` | `GND` | กราวด์ร่วม |
| `SDA` | `GPIO 21` | ขา I2C Data ค่าเริ่มต้นของ ESP32 |
| `SCL` | `GPIO 22` | ขา I2C Clock ค่าเริ่มต้นของ ESP32 |

### ค่า I2C Address ที่พบบ่อย

*   `0x3C` ใช้บ่อยที่สุดกับ OLED 0.96 นิ้ว SSD1306
*   `0x3D` พบได้บางรุ่น

หากจอไม่แสดงผล ให้ลองสแกน I2C address ก่อน หรือเปลี่ยนค่า address จาก `0x3C` เป็น `0x3D`

### Library ที่แนะนำสำหรับ PlatformIO

เพิ่ม library ใน `platformio.ini`:

```ini
lib_deps =
  adafruit/Adafruit SSD1306
  adafruit/Adafruit GFX Library
```

หากมี `lib_deps` เดิมอยู่แล้ว ให้เพิ่มสองบรรทัดนี้ต่อท้ายรายการเดิม ไม่ต้องสร้าง `lib_deps` ซ้ำ

### ตัวอย่างการเริ่มต้นใช้งานใน Arduino Framework

```cpp
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

void setup() {
  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED init failed");
    return;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("ESP32 OLED Ready");
  display.display();
}
```

### ข้อควรระวัง

*   ESP32 ใช้ logic level 3.3V จึงควรใช้ OLED ที่รองรับ 3.3V หรือมีวงจร level shifting บนโมดูล
*   ถ้าใช้สายยาวเกินไป อาจทำให้ I2C สื่อสารไม่เสถียร ควรใช้สายสั้นและต่อกราวด์ให้แน่น
*   GPIO 21 และ GPIO 22 เป็นค่า I2C default ที่นิยมใช้ แต่สามารถเปลี่ยนได้ด้วย `Wire.begin(SDA_PIN, SCL_PIN)`
