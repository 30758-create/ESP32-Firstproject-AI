# ESP32 Weather, Air Quality, Relay และ WiFiManager

เอกสารนี้อธิบายโปรเจกต์ PlatformIO สำหรับบอร์ด ESP32 DOIT DevKit V1 ที่อ่านข้อมูลสภาพอากาศและคุณภาพอากาศจาก OpenWeather API, แสดงผลบนจอ OLED SSD1306, ควบคุม Relay 3 ช่องด้วยปุ่มกด และตั้งค่า WiFi ผ่าน WiFiManager โดยไม่ต้องแก้ SSID/password ในโค้ดทุกครั้ง

อัปเดตตามโค้ดปัจจุบัน ณ วันที่ 30 พฤษภาคม 2026

## ภาพรวมโปรเจกต์

โปรแกรมทำงานบน ESP32 ด้วย Arduino Framework มีหน้าที่หลักดังนี้

- เชื่อมต่อ WiFi ด้วย WiFiManager
- เปิด Access Point สำหรับตั้งค่า WiFi ชื่อ `ESP32-Weather-Setup` เมื่อยังไม่มี WiFi หรือเชื่อมต่อไม่สำเร็จ
- อ่านข้อมูลอากาศของ `Bangkok, TH` จาก OpenWeather Current Weather API
- อ่านข้อมูลคุณภาพอากาศจาก OpenWeather Air Pollution API
- แสดงอุณหภูมิ, ความชื้น, AQI, PM2.5 และสถานะ Relay บนจอ OLED 128x64
- ควบคุม Relay 3 ช่องด้วยปุ่ม `SW1`, `SW2`, `SW3`
- ใช้ `SW1` กดค้าง 5 วินาทีเพื่อล้างค่า WiFi และเปิดหน้า WiFiManager ใหม่

## ฮาร์ดแวร์ที่ใช้

- ESP32 DOIT DevKit V1
- OLED I2C SSD1306 ขนาด 128x64 Address `0x3C`
- Relay Module 3 ช่อง แบบ Active Low
- ปุ่มกด 3 ปุ่ม แบบ Active Low พร้อม External Pull-up
- สาย USB สำหรับ upload โปรแกรมและ Serial Monitor
- แหล่งจ่ายไฟที่จ่ายกระแสได้เพียงพอ โดยเฉพาะเมื่อใช้ WiFi และ Relay พร้อมกัน

## การต่อขา

### OLED SSD1306 I2C

| OLED | ESP32 |
| --- | --- |
| `VCC` | `3V3` |
| `GND` | `GND` |
| `SDA` | `GPIO 21` |
| `SCL` | `GPIO 22` |

ค่าในโค้ด:

```cpp
const int OLED_SDA_PIN = 21;
const int OLED_SCL_PIN = 22;
const int OLED_ADDRESS = 0x3C;
```

ถ้าจอไม่ขึ้น อาจต้องตรวจ I2C address ของจอ บางรุ่นอาจเป็น `0x3D`

### Relay

Relay ในโปรเจกต์นี้เป็นแบบ Active Low

| Relay | GPIO | สถานะ ON | สถานะ OFF |
| --- | ---: | --- | --- |
| Relay 1 | `GPIO 17` | `LOW` | `HIGH` |
| Relay 2 | `GPIO 16` | `LOW` | `HIGH` |
| Relay 3 | `GPIO 4` | `LOW` | `HIGH` |

เมื่อเริ่มโปรแกรม Relay ทั้งหมดจะถูกตั้งเป็น `HIGH` เพื่อปิด Relay ก่อน

### Switch

ปุ่มกดเป็นแบบ Active Low

| Switch | GPIO | หน้าที่ |
| --- | ---: | --- |
| `SW1` | `GPIO 34` | กดสั้นเพื่อสลับ Relay 1, กดค้าง 5 วินาทีเพื่อ reset WiFi |
| `SW2` | `GPIO 35` | กดเพื่อสลับ Relay 2 |
| `SW3` | `GPIO 32` | กดเพื่อสลับ Relay 3 |

ข้อสำคัญ: `GPIO 34` และ `GPIO 35` ของ ESP32 เป็นขา input-only และไม่มี internal pull-up/pull-down ดังนั้นปุ่ม `SW1` และ `SW2` ต้องมี external pull-up ภายนอก ถ้าไม่มี อาจกดแล้วโปรแกรมไม่เห็นสถานะหรืออ่านค่าสัญญาณไม่นิ่ง

## Library ที่เกี่ยวข้อง

กำหนดไว้ใน `platformio.ini`

```ini
lib_deps =
  bblanchon/ArduinoJson
  adafruit/Adafruit SSD1306
  adafruit/Adafruit GFX Library
  tzapu/WiFiManager
```

รายละเอียดการใช้งานของแต่ละ library:

- `ArduinoJson`: แปลง JSON ที่ได้จาก OpenWeather API
- `Adafruit SSD1306`: ควบคุมจอ OLED SSD1306
- `Adafruit GFX Library`: ไลบรารีกราฟิกพื้นฐานที่ SSD1306 ใช้งาน
- `WiFiManager`: จัดการการตั้งค่า WiFi ผ่านหน้าเว็บ captive portal
- `WiFi`, `HTTPClient`, `Wire`: ไลบรารีมาตรฐานของ Arduino ESP32 สำหรับ WiFi, HTTP และ I2C

## การทำงานของโปรแกรม

เมื่อเปิดเครื่อง โปรแกรมจะทำงานตามลำดับนี้

1. เริ่ม Serial Monitor ที่ `115200 baud`
2. เริ่มจอ OLED
3. ตั้งค่าขา Relay และ Switch
4. ตรวจว่า `SW1` ถูกกดค้างตอนเปิดเครื่องหรือไม่
5. ถ้ากด `SW1` ค้างครบ 5 วินาที จะล้างค่า WiFi ที่บันทึกไว้
6. เริ่ม WiFiManager เพื่อเชื่อมต่อ WiFi
7. อ่านข้อมูลอากาศและคุณภาพอากาศจาก OpenWeather
8. แสดงข้อมูลบน OLED
9. ใน `loop()` จะตรวจปุ่ม, refresh OLED, reconnect WiFi และอ่านข้อมูลใหม่ทุก 2 นาที

## การตั้งค่า WiFi

โปรเจกต์นี้ไม่ใช้ SSID/password แบบ hardcode แล้ว แต่ใช้ WiFiManager

### ตั้งค่า WiFi ครั้งแรก

1. Upload โปรแกรมลง ESP32
2. เปิดเครื่อง ESP32
3. ถ้ายังไม่มี WiFi ที่บันทึกไว้ ESP32 จะเปิด AP ชื่อ `ESP32-Weather-Setup`
4. ใช้มือถือหรือคอมพิวเตอร์เชื่อมต่อ WiFi ชื่อนี้
5. หน้าเว็บตั้งค่า WiFi จะเปิดขึ้นอัตโนมัติ หรือเข้าเองที่ `192.168.4.1`
6. เลือก WiFi บ้าน/สำนักงาน และกรอกรหัสผ่าน
7. ESP32 จะบันทึกค่า WiFi แล้วเชื่อมต่อเองในครั้งถัดไป

### Reset WiFi ด้วย SW1

ทำได้ 2 วิธี

- ตอนเปิดเครื่อง: กด `SW1` ค้างไว้ แล้วเปิด/รีเซ็ต ESP32 ค้างให้ครบ 5 วินาที
- ตอนโปรแกรมทำงานอยู่: กด `SW1` ค้างให้ครบ 5 วินาที

เมื่อ reset สำเร็จ โปรแกรมจะล้าง WiFi เดิมและเปิด AP `ESP32-Weather-Setup` เพื่อให้ตั้งค่า WiFi ใหม่

ใน Serial Monitor จะเห็นข้อความประมาณนี้:

```text
SW1 pressed. Hold 5 seconds to reset WiFi.
SW1 held for 5 seconds. Reset WiFi now.
Resetting saved WiFi settings.
Starting WiFiManager.
Config AP: ESP32-Weather-Setup
```

## การใช้งานปุ่มและ Relay

- กด `SW1` สั้น ๆ เพื่อสลับ Relay 1
- กด `SW2` เพื่อสลับ Relay 2
- กด `SW3` เพื่อสลับ Relay 3
- กด `SW1` ค้าง 5 วินาทีเพื่อ reset WiFi

โปรแกรมมี debounce delay `50 ms` เพื่อลดปัญหาปุ่มเด้ง

## ข้อมูลที่แสดงบน OLED

หน้าจอ OLED แสดงข้อมูลหลักดังนี้

- ชื่อจังหวัด: `Bangkok`
- สถานะ WiFi: `WiFi OK` หรือ `NO WIFI`
- อุณหภูมิ หน่วยองศาเซลเซียส
- ความชื้น หน่วยเปอร์เซ็นต์
- AQI จาก OpenWeather Air Pollution API
- PM2.5
- สถานะ Relay 1, Relay 2, Relay 3

OLED refresh ทุก `1000 ms`

## OpenWeather API

โค้ดใช้ API key จากตัวแปรนี้ใน `src/main.cpp`

```cpp
const char* OPENWEATHER_API_KEY = "...";
```

ตำแหน่งที่อ่านข้อมูลถูกตั้งเป็น:

```cpp
const char* PROVINCE_NAME = "Bangkok";
const char* COUNTRY_CODE = "TH";
```

โปรแกรมอ่านข้อมูลใหม่ทุก `120000 ms` หรือ 2 นาที

หมายเหตุสำคัญ: ไม่ควรเผยแพร่ API key ลง repository สาธารณะ ถ้าจะนำโปรเจกต์ขึ้น GitHub ควรย้าย API key ไปไว้ในไฟล์ config ที่ไม่ commit หรือใช้ build flag/env แทน

## วิธีเปิดโปรเจกต์ด้วย VS Code

1. ติดตั้ง Visual Studio Code
2. ติดตั้ง Extension `PlatformIO IDE`
3. เปิด VS Code
4. เลือก `File > Open Folder...`
5. เลือกโฟลเดอร์โปรเจกต์นี้:

```text
c:\Users\SMARTYYY\Documents\PlatformIO\Projects\ESP32-FIrstproject
```

6. รอ PlatformIO โหลด environment และติดตั้ง library จาก `platformio.ini`
7. เปิดไฟล์ `src/main.cpp` เพื่อดูหรือแก้โค้ด

## วิธี Build, Upload และเปิด Serial Monitor

ใน VS Code ที่ติดตั้ง PlatformIO แล้ว สามารถใช้ปุ่มบน toolbar หรือเมนูของ PlatformIO ได้

- Build: กดปุ่ม `Build` หรือใช้คำสั่ง `PlatformIO: Build`
- Upload: ต่อ ESP32 ผ่าน USB แล้วกด `Upload`
- Serial Monitor: กด `Serial Monitor`

Serial Monitor ใช้ความเร็ว:

```ini
monitor_speed = 115200
```

ถ้าใช้ terminal และมี PlatformIO CLI อยู่ใน PATH สามารถใช้คำสั่ง:

```powershell
pio run
pio run --target upload
pio device monitor
```

ถ้า `pio` ไม่อยู่ใน PATH บนเครื่องนี้อาจเรียกจาก path ของ PlatformIO โดยตรง:

```powershell
& $env:USERPROFILE\.platformio\penv\Scripts\platformio.exe run
```

## โครงสร้างไฟล์สำคัญ

```text
.
├── src/
│   └── main.cpp          # โค้ดหลักของ ESP32
├── platformio.ini        # ตั้งค่า board, framework, monitor speed และ library
├── .vscode/
│   └── settings.json     # ปุ่ม toolbar ของ PlatformIO ใน VS Code
└── README.md             # เอกสารโปรเจกต์
```

## ค่าคงที่สำคัญในโปรแกรม

| ตัวแปร | ค่า | ความหมาย |
| --- | --- | --- |
| `WEATHER_INTERVAL_MS` | `120000UL` | อ่านอากาศทุก 2 นาที |
| `WIFI_RETRY_INTERVAL_MS` | `10000UL` | retry WiFi ทุก 10 วินาที |
| `OLED_REFRESH_MS` | `1000UL` | refresh OLED ทุก 1 วินาที |
| `WIFI_RESET_HOLD_MS` | `5000UL` | เวลากด SW1 ค้างเพื่อ reset WiFi |
| `WIFI_MANAGER_AP_NAME` | `ESP32-Weather-Setup` | ชื่อ AP ของ WiFiManager |

## การแก้ปัญหาเบื้องต้น

### กด SW1 ค้างแล้วไม่ reset WiFi

- เปิด Serial Monitor ที่ `115200`
- กด `SW1` แล้วดูว่ามีข้อความ `SW1 pressed. Hold 5 seconds to reset WiFi.` หรือไม่
- ถ้าไม่มีข้อความ ให้ตรวจ wiring ของ `SW1`
- ตรวจว่า `GPIO 34` มี external pull-up แล้วหรือยัง เพราะขานี้ไม่มี internal pull-up
- ตรวจ logic ของปุ่มว่าตอนกดเป็น `LOW` จริงหรือไม่

### OLED ไม่แสดงผล

- ตรวจสาย `SDA = GPIO 21`, `SCL = GPIO 22`
- ตรวจไฟเลี้ยงและ GND
- ตรวจ I2C address ว่าเป็น `0x3C` หรือ `0x3D`
- ดู Serial Monitor ว่ามีข้อความ `OLED init failed. Check wiring/address 0x3C.` หรือไม่

### ต่อ WiFi ไม่ได้

- กด `SW1` ค้าง 5 วินาทีเพื่อ reset WiFi
- เชื่อมต่อ AP `ESP32-Weather-Setup`
- เข้า `192.168.4.1` แล้วตั้งค่า WiFi ใหม่
- ตรวจว่า WiFi เป็นย่าน 2.4 GHz เพราะ ESP32 ไม่รองรับ WiFi 5 GHz

### อ่านอากาศไม่ได้

- ตรวจว่า ESP32 ต่อ WiFi แล้ว
- ตรวจว่า OpenWeather API key ยังใช้งานได้
- ตรวจ Serial Monitor ว่ามี HTTP error หรือ JSON error หรือไม่
- ตรวจว่าอินเทอร์เน็ตของ WiFi ที่เชื่อมต่อสามารถออกเว็บได้

## ข้อควรระวัง

- GPIO ของ ESP32 ใช้ logic 3.3V ไม่ควรป้อน 5V เข้าขา GPIO โดยตรง
- Relay module บางรุ่นใช้ไฟ 5V และอาจต้องแยกไฟเลี้ยงให้เหมาะสม
- ถ้าใช้ Relay ควบคุมไฟบ้านหรือโหลด AC ต้องระวังอันตรายจากไฟฟ้าแรงสูง และควรแยกวงจรให้ปลอดภัย
- ไม่ควรเผยแพร่ OpenWeather API key สู่สาธารณะ
- `GPIO 34` และ `GPIO 35` เป็น input-only และไม่มี internal pull-up/pull-down

## สถานะการ Build ล่าสุด

โปรเจกต์ build ผ่านด้วย PlatformIO environment:

```ini
[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
```

ผล build ล่าสุด:

```text
[SUCCESS]
```
