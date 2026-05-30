# ESP32 Weather, Air Quality, Relay, WiFiManager และ Telegram

โปรเจกต์นี้เป็นโปรแกรมสำหรับบอร์ด ESP32 DOIT DevKit V1 ใช้ Arduino Framework บน PlatformIO เพื่ออ่านข้อมูลสภาพอากาศและคุณภาพอากาศจาก OpenWeather, แสดงผลบนจอ OLED SSD1306, ควบคุม Relay 3 ช่องด้วยปุ่มกด, ตั้งค่า WiFi ผ่าน WiFiManager และส่งการแจ้งเตือนไปยัง Telegram

เอกสารนี้อัปเดตตามโค้ดปัจจุบันใน `src/main.cpp`

## ความสามารถหลัก

- เชื่อมต่อ WiFi ด้วย WiFiManager โดยไม่ต้อง hardcode SSID/password
- เปิด Access Point ชื่อ `ESP32-Weather-Setup` เมื่อยังไม่มีค่า WiFi หรือจำเป็นต้องตั้งค่าใหม่
- Reset ค่า WiFi ด้วยการกด `SW1` ค้าง 5 วินาที
- อ่านข้อมูลอากาศของ `Bangkok, TH` จาก OpenWeather Current Weather API
- อ่านข้อมูล AQI และ PM2.5 จาก OpenWeather Air Pollution API
- แสดงข้อมูลบน OLED 128x64 ผ่าน I2C
- ควบคุม Relay 3 ช่องด้วย `SW1`, `SW2`, `SW3`
- ส่ง Telegram notification เมื่อ WiFi เชื่อมต่อ, reset WiFi, Relay เปลี่ยนสถานะ และส่งรายงานอากาศเป็นช่วงเวลา

## ฮาร์ดแวร์ที่ใช้

- ESP32 DOIT DevKit V1
- OLED I2C SSD1306 128x64 address `0x3C`
- Relay module 3 ช่อง แบบ Active Low
- ปุ่มกด 3 ปุ่ม แบบ Active Low พร้อม external pull-up
- สาย USB สำหรับ upload และ Serial Monitor
- แหล่งจ่ายไฟที่เหมาะสมกับ ESP32 และ Relay

รายละเอียดการต่อขาและข้อควรระวังฮาร์ดแวร์อยู่ใน [ESP32DevkitBoard.md](ESP32DevkitBoard.md)

## การต่อขาโดยสรุป

### OLED I2C

| OLED | ESP32 |
| --- | --- |
| `VCC` | `3V3` |
| `GND` | `GND` |
| `SDA` | `GPIO 21` |
| `SCL` | `GPIO 22` |

### Relay

Relay เป็นแบบ Active Low

| Relay | GPIO | ON | OFF |
| --- | ---: | --- | --- |
| Relay 1 | `GPIO 17` | `LOW` | `HIGH` |
| Relay 2 | `GPIO 16` | `LOW` | `HIGH` |
| Relay 3 | `GPIO 4` | `LOW` | `HIGH` |

### Switch

Switch เป็นแบบ Active Low

| Switch | GPIO | หน้าที่ |
| --- | ---: | --- |
| `SW1` | `GPIO 34` | กดสั้นเพื่อสลับ Relay 1, กดค้าง 5 วินาทีเพื่อ reset WiFi |
| `SW2` | `GPIO 35` | กดเพื่อสลับ Relay 2 |
| `SW3` | `GPIO 32` | กดเพื่อสลับ Relay 3 |

ข้อสำคัญ: `GPIO 34` และ `GPIO 35` ไม่มี internal pull-up/pull-down จึงต้องมี external pull-up ภายนอก ไม่อย่างนั้นปุ่มอาจอ่านค่าไม่นิ่งหรือกดแล้วไม่ทำงาน

## Library ที่ใช้

กำหนดไว้ใน `platformio.ini`

```ini
lib_deps =
  bblanchon/ArduinoJson
  adafruit/Adafruit SSD1306
  adafruit/Adafruit GFX Library
  tzapu/WiFiManager
```

Library หลัก:

- `ArduinoJson`: อ่านและสร้าง JSON สำหรับ OpenWeather และ Telegram request
- `Adafruit SSD1306`: ควบคุมจอ OLED SSD1306
- `Adafruit GFX Library`: ฟังก์ชันวาดกราฟิกและข้อความบน OLED
- `WiFiManager`: ตั้งค่า WiFi ผ่าน captive portal
- `WiFi`, `HTTPClient`, `WiFiClientSecure`, `Wire`: library จาก Arduino ESP32 core สำหรับ WiFi, HTTP/HTTPS และ I2C

## ค่าตั้งต้นสำคัญ

| ตัวแปร | ค่า | ความหมาย |
| --- | --- | --- |
| `PROVINCE_NAME` | `Bangkok` | เมืองที่ใช้ดึงข้อมูลอากาศ |
| `COUNTRY_CODE` | `TH` | ประเทศ |
| `WEATHER_INTERVAL_MS` | `120000UL` | อ่านข้อมูลอากาศทุก 2 นาที |
| `WIFI_RETRY_INTERVAL_MS` | `10000UL` | ลอง reconnect WiFi ทุก 10 วินาที |
| `OLED_REFRESH_MS` | `1000UL` | refresh OLED ทุก 1 วินาที |
| `WIFI_RESET_HOLD_MS` | `5000UL` | เวลากด SW1 ค้างเพื่อ reset WiFi |
| `TELEGRAM_TIMEOUT_MS` | `4000UL` | timeout การส่ง Telegram |
| `TELEGRAM_WEATHER_INTERVAL_MS` | `600000UL` | ส่งรายงานอากาศ Telegram ทุก 10 นาที |
| `WIFI_MANAGER_AP_NAME` | `ESP32-Weather-Setup` | ชื่อ AP สำหรับตั้งค่า WiFi |

## วิธีเปิดโปรเจกต์ด้วย VS Code

1. ติดตั้ง Visual Studio Code
2. ติดตั้ง extension `PlatformIO IDE`
3. เปิด VS Code
4. เลือก `File > Open Folder...`
5. เลือกโฟลเดอร์โปรเจกต์นี้

```text
c:\Users\SMARTYYY\Documents\PlatformIO\Projects\ESP32-FIrstproject
```

6. รอ PlatformIO โหลด environment และติดตั้ง library จาก `platformio.ini`
7. เปิด `src/main.cpp` เพื่อแก้ไขโปรแกรม

## วิธี Build, Upload และ Serial Monitor

ใน VS Code สามารถใช้ปุ่มของ PlatformIO:

- `Build`: compile โปรแกรม
- `Upload`: upload firmware ลง ESP32
- `Serial Monitor`: เปิด log ที่ baud rate `115200`

หรือใช้ terminal ถ้ามี PlatformIO CLI:

```powershell
pio run
pio run --target upload
pio device monitor
```

ถ้า `pio` ไม่อยู่ใน PATH บนเครื่องนี้สามารถเรียกจาก path ตรง:

```powershell
& $env:USERPROFILE\.platformio\penv\Scripts\platformio.exe run
```

## การตั้งค่า WiFi

โปรเจกต์นี้ใช้ WiFiManager

### ตั้งค่า WiFi ครั้งแรก

1. Upload โปรแกรมลง ESP32
2. เปิดเครื่อง ESP32
3. ถ้ายังไม่มีค่า WiFi บันทึกไว้ ESP32 จะเปิด AP ชื่อ `ESP32-Weather-Setup`
4. ใช้มือถือหรือคอมพิวเตอร์เชื่อมต่อ AP นี้
5. เข้า `192.168.4.1` ถ้าหน้าเว็บไม่เด้งขึ้นเอง
6. เลือก WiFi 2.4 GHz และกรอกรหัสผ่าน
7. ESP32 จะบันทึกค่า WiFi และใช้เชื่อมต่อครั้งต่อไป

### Reset WiFi

ทำได้ 2 แบบ:

- ขณะเปิดเครื่อง: กด `SW1` ค้างไว้ แล้วเปิดหรือ reset ESP32 ค้างให้ครบ 5 วินาที
- ขณะโปรแกรมทำงาน: กด `SW1` ค้าง 5 วินาที

เมื่อ reset สำเร็จ ESP32 จะล้างค่า WiFi เดิมและเปิด AP `ESP32-Weather-Setup` ใหม่

## การใช้งานปุ่ม

- `SW1` กดสั้น: สลับ Relay 1
- `SW1` กดค้าง 5 วินาที: reset WiFi
- `SW2` กดสั้น: สลับ Relay 2
- `SW3` กดสั้น: สลับ Relay 3

โปรแกรมมี debounce `50 ms` เพื่อลดปัญหาสัญญาณปุ่มเด้ง

## OLED Display

ข้อมูลที่แสดงบนจอ:

- เมือง `Bangkok`
- สถานะ WiFi เป็น `WIFI OK` หรือ `WIFI NO OK`
- อุณหภูมิ
- ความชื้น
- AQI
- PM2.5
- สถานะ Relay 1, Relay 2, Relay 3

## OpenWeather API

กำหนด API key ใน `src/main.cpp`

```cpp
const char* OPENWEATHER_API_KEY = "...";
```

ตำแหน่งที่อ่านข้อมูล:

```cpp
const char* PROVINCE_NAME = "Bangkok";
const char* COUNTRY_CODE = "TH";
```

ข้อควรระวัง: ถ้าจะนำโปรเจกต์ขึ้น repository สาธารณะ ไม่ควรเผยแพร่ API key จริง ควรย้ายไป config ส่วนตัวหรือ build flag ที่ไม่ commit

## Telegram Notification

ตั้งค่าใน `src/main.cpp`

```cpp
const char* TELEGRAM_BOT_TOKEN = "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE";
const char* TELEGRAM_CHAT_ID = "PUT_YOUR_TELEGRAM_CHAT_ID_HERE";
```

ถ้ายังไม่ได้แก้ค่า placeholder โปรแกรมจะข้ามการส่ง Telegram และพิมพ์ log:

```text
Telegram is not configured. Skip notification.
```

### วิธีหา Bot Token

1. เปิด Telegram
2. ค้นหา `@BotFather`
3. ส่งคำสั่ง `/newbot`
4. ตั้งชื่อ bot
5. ตั้ง username ที่ลงท้ายด้วย `bot`
6. นำ token ที่ BotFather ให้มาใส่ใน `TELEGRAM_BOT_TOKEN`

### วิธีหา Chat ID

1. เปิดแชตกับ bot ที่สร้าง
2. กด Start หรือส่งข้อความหา bot เช่น `hello`
3. เปิด URL นี้ โดยเปลี่ยน `<BOT_TOKEN>` เป็น token จริง

```text
https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

4. หา `"chat":{"id":...}` แล้วนำเลข id ไปใส่ใน `TELEGRAM_CHAT_ID`

### เหตุการณ์ที่ส่ง Telegram

- WiFi เชื่อมต่อสำเร็จ
- reset WiFi settings
- Relay เปลี่ยนสถานะ
- Weather/Air Quality report ทุก 10 นาที

การส่ง Telegram ใช้ HTTPS ผ่าน `WiFiClientSecure` และส่งแบบ `POST JSON` เพื่อให้ข้อความอ่านได้ถูกต้อง

## โครงสร้างไฟล์

```text
.
├── src/
│   └── main.cpp
├── platformio.ini
├── README.md
├── ESP32DevkitBoard.md
├── include/
├── lib/
└── test/
```

## การแก้ปัญหาเบื้องต้น

### OLED ขึ้นข้อความไม่ครบ

- ตรวจว่าใช้โค้ดล่าสุดที่ขยับข้อความ WiFi ไปที่ `x = 68`
- ถ้าปรับข้อความเอง ให้ระวังความกว้างจอ OLED มีเพียง 128 pixels

### กด SW1 ค้างแล้วไม่ reset WiFi

- เปิด Serial Monitor ที่ `115200`
- กด SW1 แล้วควรเห็น `SW1 pressed. Hold 5 seconds to reset WiFi.`
- ถ้าไม่เห็น ให้ตรวจ wiring และ external pull-up ของ `GPIO 34`
- ตรวจว่าปุ่มเป็น Active Low จริงหรือไม่

### ต่อ WiFi ไม่ได้

- ESP32 รองรับ WiFi 2.4 GHz เท่านั้น
- reset WiFi ด้วย SW1 แล้วตั้งค่าใหม่ผ่าน AP `ESP32-Weather-Setup`
- ตรวจรหัสผ่าน WiFi

### Telegram ไม่ส่ง

- ตรวจ `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_CHAT_ID`
- ต้องส่งข้อความหา bot อย่างน้อย 1 ครั้งก่อนใช้ `getUpdates`
- ตรวจว่า ESP32 ต่อ internet ได้
- ดู Serial Monitor ว่ามี `Telegram API HTTP error` หรือไม่

### ข้อมูล Telegram มาช้า

- Telegram ใช้ HTTPS จึงอาจมี delay จาก TLS handshake และ internet
- โค้ดตั้ง timeout ไว้ `4000 ms`
- Weather report ส่งทุก 10 นาที เพื่อลดการถ่วงระบบ

## สถานะ Build ล่าสุด

โปรเจกต์ build ผ่านด้วย environment:

```ini
[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
```
