# ESP32 DevKit Board และ Wiring

เอกสารนี้อธิบายการต่อวงจรและข้อควรระวังของฮาร์ดแวร์สำหรับโปรเจกต์ ESP32 Weather Dashboard

## Board

โปรเจกต์ใช้บอร์ด:

```ini
board = esp32doit-devkit-v1
framework = arduino
```

ESP32 ใช้ logic level `3.3V` ห้ามป้อนสัญญาณ `5V` เข้าขา GPIO โดยตรง

## Pin ที่ใช้ทั้งหมด

| ฟังก์ชัน | GPIO | ทิศทาง | หมายเหตุ |
| --- | ---: | --- | --- |
| OLED SDA | `21` | I2C | Data |
| OLED SCL | `22` | I2C | Clock |
| Relay 1 | `17` | Output | Active Low |
| Relay 2 | `16` | Output | Active Low |
| Relay 3 | `4` | Output | Active Low |
| SW1 | `34` | Input | Active Low, ต้องใช้ external pull-up |
| SW2 | `35` | Input | Active Low, ต้องใช้ external pull-up |
| SW3 | `32` | Input | Active Low, แนะนำ external pull-up |
| LED_BUILTIN | ส่วนมากคือ `2` | Output | ขึ้นกับบอร์ด |

## OLED SSD1306 I2C

OLED ที่ใช้:

- Driver: SSD1306
- Resolution: 128x64
- I2C address ในโค้ด: `0x3C`

การต่อสาย:

| OLED | ESP32 |
| --- | --- |
| `VCC` | `3V3` |
| `GND` | `GND` |
| `SDA` | `GPIO 21` |
| `SCL` | `GPIO 22` |

ถ้าจอไม่ติด:

- ตรวจสาย SDA/SCL
- ตรวจ GND ร่วม
- ตรวจ address ว่าเป็น `0x3C` หรือ `0x3D`
- ดู Serial Monitor ว่ามี `OLED init failed. Check wiring/address 0x3C.`

## Layout บน OLED

จอแสดง:

- `Bangkok`
- `WIFI OK` หรือ `WIFI NO OK`
- `Temp`
- `Hum`
- `AQI`
- `PM`
- `Time HH:MM:SS`
- badge `R1`, `R2`, `R3`

ถ้า NTP ยัง sync ไม่สำเร็จ เวลาจะแสดง:

```text
Time --:--:--
```

## Relay Module

Relay ในโปรเจกต์นี้เป็นแบบ Active Low:

- GPIO `LOW` = Relay ON
- GPIO `HIGH` = Relay OFF

| Relay | GPIO | สถานะเริ่มต้น |
| --- | ---: | --- |
| Relay 1 | `GPIO 17` | OFF |
| Relay 2 | `GPIO 16` | OFF |
| Relay 3 | `GPIO 4` | OFF |

ตัวอย่าง logic:

```cpp
digitalWrite(RELAY1_PIN, LOW);   // ON
digitalWrite(RELAY1_PIN, HIGH);  // OFF
```

ข้อควรระวัง:

- Relay module บางรุ่นใช้ไฟเลี้ยง 5V ต้องตรวจว่า input control รองรับ 3.3V หรือไม่
- ถ้าควบคุมไฟบ้าน/AC ต้องระวังไฟฟ้าแรงสูง
- ควรแยกวงจรไฟแรงสูงออกจาก ESP32
- ถ้า Relay ใช้กระแสสูง ควรใช้แหล่งจ่ายไฟแยก
- ต้องต่อ GND ร่วมระหว่าง ESP32 กับ relay module เมื่อใช้สัญญาณควบคุมร่วมกัน

## Switch

ปุ่มเป็นแบบ Active Low:

- ไม่กด = `HIGH`
- กด = `LOW`

| Switch | GPIO | หน้าที่ |
| --- | ---: | --- |
| `SW1` | `GPIO 34` | กดสั้น Relay 1, กดค้าง 5 วินาที reset WiFi |
| `SW2` | `GPIO 35` | กดสั้น Relay 2 |
| `SW3` | `GPIO 32` | กดสั้น Relay 3 |

วงจรปุ่มที่แนะนำ:

```text
3V3 ---[10k resistor]--- GPIO
                         |
                       switch
                         |
                        GND
```

## ข้อสำคัญของ GPIO 34 และ GPIO 35

`GPIO 34` และ `GPIO 35` เป็น input-only และไม่มี internal pull-up/pull-down

ดังนั้นต้องใช้ external pull-up จริง ห้ามหวังพึ่ง `INPUT_PULLUP`

ถ้าไม่มี external pull-up อาจเกิดอาการ:

- กดปุ่มแล้ว Serial Monitor ไม่ขึ้น log
- Relay เปลี่ยนเอง
- กด SW1 ค้างแล้วไม่ reset WiFi
- สถานะปุ่มไม่นิ่ง

## WiFi

ESP32 รองรับ WiFi 2.4 GHz เท่านั้น ไม่รองรับ 5 GHz

WiFiManager AP:

```text
ESP32-Weather-Setup
```

หน้า config:

```text
192.168.4.1
```

## MQTT

โปรเจกต์ใช้ MQTT ผ่าน WiFi ไปยัง HiveMQ public broker:

```text
broker.hivemq.com:1883
```

topic มี `BOARD_ID` เพื่อกันข้อมูลชน:

```text
esp32/weather/esp32-weather-001/...
```

หากมีหลายบอร์ด ควรเปลี่ยน `BOARD_ID` ใน `src/main.cpp` ให้ไม่ซ้ำกัน เช่น:

```cpp
const char* BOARD_ID = "esp32-weather-002";
```

## Serial Monitor

ตั้งค่า:

```ini
monitor_speed = 115200
```

ข้อความสำคัญที่ควรเห็น:

```text
ESP32 OpenWeather program started.
Starting WiFiManager.
WiFi connected, IP: ...
NTP time synced: ...
Connecting MQTT: broker.hivemq.com
MQTT connected.
Bangkok Weather / Air Quality
```

เมื่อกด SW1:

```text
SW1 pressed. Hold 5 seconds to reset WiFi.
SW1 held for 5 seconds. Reset WiFi now.
```

## Checklist ก่อนทดสอบ

- OLED ต่อ `SDA = GPIO 21`, `SCL = GPIO 22`
- OLED address ตรงกับ `0x3C`
- Relay ต่อถูกขาและเป็น Active Low
- SW1/SW2 มี external pull-up
- WiFi เป็น 2.4 GHz
- OpenWeather API key ถูกต้อง
- Telegram token/chat id ถูกต้อง ถ้าต้องใช้ Telegram
- MQTT broker ออก internet ผ่าน port `1883` ได้
- `BOARD_ID` ไม่ซ้ำกับบอร์ดตัวอื่น
- Serial Monitor ตั้งที่ `115200`
