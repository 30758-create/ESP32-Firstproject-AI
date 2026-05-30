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
