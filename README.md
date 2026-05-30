# ESP32 Weather Dashboard

โปรเจกต์นี้เป็นระบบ IoT บนบอร์ด ESP32 DOIT DevKit V1 สำหรับแสดงข้อมูลอากาศบน OLED, ควบคุม Relay 3 ช่อง, ตั้งค่า WiFi ผ่าน WiFiManager, แจ้งเตือนผ่าน Telegram, sync เวลาด้วย NTP และเชื่อมต่อ MQTT ไปยัง HiveMQ public broker

เอกสารนี้อัปเดตตาม `src/main.cpp` และ `platformio.ini` ปัจจุบัน

## ภาพรวม

ความสามารถหลักของโปรเจกต์:

- ตั้งค่า WiFi ผ่าน WiFiManager โดยไม่ต้อง hardcode SSID/password
- reset ค่า WiFi ด้วย `SW1` กดค้าง 5 วินาที
- อ่าน Weather และ Air Quality ของ `Bangkok, TH` จาก OpenWeather
- sync เวลาจริงด้วย NTP timezone `Asia/Bangkok` หรือ UTC+7
- แสดงข้อมูลบน OLED SSD1306 128x64
- ควบคุม Relay 3 ช่องจากปุ่ม `SW1`, `SW2`, `SW3`
- ส่ง Telegram notification
- เชื่อมต่อ MQTT ไปยัง HiveMQ public broker
- publish telemetry/status/event ผ่าน MQTT
- subscribe control topic เพื่อสั่ง Relay ผ่าน MQTT
- ใช้ `BOARD_ID` ใน MQTT topic ทุกเส้นเพื่อป้องกันข้อมูลชนกับบอร์ดอื่น

## โครงสร้างโปรเจกต์

```text
.
|-- src/
|   `-- main.cpp
|-- platformio.ini
|-- README.md
|-- ESP32DevkitBoard.md
|-- include/
|-- lib/
`-- test/
```

## Board และ Framework

จาก `platformio.ini`

```ini
[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
```

## Library

Library ที่ใช้ใน `platformio.ini`

```ini
lib_deps =
  bblanchon/ArduinoJson
  adafruit/Adafruit SSD1306
  adafruit/Adafruit GFX Library
  tzapu/WiFiManager
  knolleary/PubSubClient
```

หน้าที่ของ library:

- `ArduinoJson`: parse JSON จาก OpenWeather และสร้าง JSON payload สำหรับ Telegram/MQTT
- `Adafruit SSD1306`: ควบคุมจอ OLED SSD1306
- `Adafruit GFX Library`: วาดข้อความและกราฟิกบน OLED
- `WiFiManager`: captive portal สำหรับตั้งค่า WiFi
- `PubSubClient`: MQTT client สำหรับเชื่อมต่อ HiveMQ
- `WiFi`, `HTTPClient`, `WiFiClientSecure`, `Wire`, `time.h`: library จาก ESP32 Arduino core

## ค่าตั้งต้นสำคัญ

| ตัวแปร | ค่า | ความหมาย |
| --- | --- | --- |
| `BOARD_ID` | `esp32-weather-001` | ID บอร์ด ใช้ใน MQTT topic |
| `PROVINCE_NAME` | `Bangkok` | เมืองที่อ่านข้อมูลอากาศ |
| `COUNTRY_CODE` | `TH` | ประเทศ |
| `WEATHER_INTERVAL_MS` | `120000UL` | อ่านข้อมูลอากาศทุก 2 นาที |
| `WIFI_RETRY_INTERVAL_MS` | `10000UL` | reconnect WiFi ทุก 10 วินาที |
| `OLED_REFRESH_MS` | `1000UL` | refresh OLED ทุก 1 วินาที |
| `WIFI_RESET_HOLD_MS` | `5000UL` | เวลากด SW1 ค้างเพื่อ reset WiFi |
| `MQTT_RETRY_INTERVAL_MS` | `5000UL` | reconnect MQTT ทุก 5 วินาที |
| `MQTT_STATUS_INTERVAL_MS` | `30000UL` | publish MQTT status ทุก 30 วินาที |
| `WIFI_MANAGER_AP_NAME` | `ESP32-Weather-Setup` | AP สำหรับตั้งค่า WiFi |
| `MQTT_SERVER` | `broker.hivemq.com` | HiveMQ public broker |
| `MQTT_PORT` | `1883` | MQTT port แบบไม่เข้ารหัส |
| `MQTT_BASE_TOPIC` | `esp32/weather` | MQTT base topic |
| `NTP_SERVER_1` | `pool.ntp.org` | NTP server หลัก |
| `NTP_SERVER_2` | `time.nist.gov` | NTP server สำรอง |
| `GMT_OFFSET_SEC` | `7 * 3600` | เวลาไทย UTC+7 |
| `DAYLIGHT_OFFSET_SEC` | `0` | ประเทศไทยไม่มี daylight saving |
| `DEBOUNCE_DELAY_MS` | `50UL` | debounce ปุ่มกด |

## Hardware และ Pin

รายละเอียดเชิงฮาร์ดแวร์อยู่ใน [ESP32DevkitBoard.md](ESP32DevkitBoard.md)

สรุป pin ที่ใช้:

| อุปกรณ์ | GPIO | หมายเหตุ |
| --- | ---: | --- |
| OLED SDA | `21` | I2C data |
| OLED SCL | `22` | I2C clock |
| Relay 1 | `17` | Active Low |
| Relay 2 | `16` | Active Low |
| Relay 3 | `4` | Active Low |
| SW1 | `34` | Active Low, ต้องมี external pull-up |
| SW2 | `35` | Active Low, ต้องมี external pull-up |
| SW3 | `32` | Active Low |

## OLED Display

OLED แสดงข้อมูลต่อไปนี้:

- `Bangkok`
- สถานะ WiFi: `WIFI OK` หรือ `WIFI NO OK`
- Temperature
- Humidity
- AQI
- PM2.5
- เวลา NTP: `Time HH:MM:SS`
- สถานะ Relay 1-3

ถ้ายัง sync เวลาไม่ได้ จะแสดง:

```text
Time --:--:--
```

## WiFiManager

เมื่อ ESP32 ยังไม่มี WiFi ที่บันทึกไว้ หรือเชื่อมต่อไม่ได้ WiFiManager จะเปิด AP:

```text
ESP32-Weather-Setup
```

ให้เชื่อมต่อ AP นี้ แล้วเข้า:

```text
192.168.4.1
```

จากนั้นเลือก WiFi 2.4 GHz และกรอกรหัสผ่าน

## Reset WiFi ด้วย SW1

ทำได้ 2 กรณี:

- ตอนเปิดเครื่อง: กด `SW1` ค้างไว้ แล้วเปิด/รีเซ็ต ESP32 ค้างให้ครบ 5 วินาที
- ตอนโปรแกรมทำงานอยู่: กด `SW1` ค้าง 5 วินาที

เมื่อ reset สำเร็จ โปรแกรมจะล้างค่า WiFi เดิมและเปิด AP `ESP32-Weather-Setup` ใหม่

## การใช้งานปุ่มและ Relay

- `SW1` กดสั้น: toggle Relay 1
- `SW1` กดค้าง 5 วินาที: reset WiFi
- `SW2` กดสั้น: toggle Relay 2
- `SW3` กดสั้น: toggle Relay 3

Relay เป็นแบบ Active Low:

- `LOW` = ON
- `HIGH` = OFF

## OpenWeather

ตั้งค่าใน `src/main.cpp`

```cpp
const char* OPENWEATHER_API_KEY = "...";
const char* PROVINCE_NAME = "Bangkok";
const char* COUNTRY_CODE = "TH";
```

โปรแกรมอ่าน:

- Current Weather API เพื่อดึง temperature, humidity, description, lat/lon
- Air Pollution API เพื่อดึง AQI, PM2.5, PM10

อ่านข้อมูลทุก 2 นาที ตามค่า:

```cpp
const unsigned long WEATHER_INTERVAL_MS = 120000UL;
```

ข้อควรระวัง: ในโค้ดปัจจุบันมี API key จริง ถ้าจะเผยแพร่ public repository ควรย้าย API key ออกจาก source code

## NTP Time

โปรแกรม sync เวลาหลัง WiFi เชื่อมต่อสำเร็จ:

```cpp
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;
```

Timezone คือ `Asia/Bangkok` หรือ UTC+7

เวลาถูกใช้ใน:

- OLED: `Time HH:MM:SS`
- Telegram weather report
- MQTT `telemetry/status` field `time`

## Telegram

ตั้งค่าใน `src/main.cpp`

```cpp
const char* TELEGRAM_BOT_TOKEN = "...";
const char* TELEGRAM_CHAT_ID = "...";
```

เหตุการณ์ที่ส่ง Telegram:

- WiFi connected
- reset WiFi settings
- Relay เปลี่ยนสถานะ
- Weather/Air Quality report หลังอ่านข้อมูลเสร็จ

Telegram ส่งผ่าน HTTPS ไปที่ Telegram Bot API ด้วย `WiFiClientSecure` และ `POST JSON`

ข้อควรระวัง: ในโค้ดปัจจุบันมี Telegram token/chat id จริง ถ้าจะเผยแพร่ public repository ควรย้ายออกจาก source code

## MQTT HiveMQ

โปรเจกต์เชื่อมต่อ MQTT ไปที่ HiveMQ public broker:

```cpp
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;
```

ตั้งค่า topic base และ board id:

```cpp
const char* BOARD_ID = "esp32-weather-001";
const char* MQTT_BASE_TOPIC = "esp32/weather";
```

รูปแบบ topic:

```text
esp32/weather/<BOARD_ID>/<category>/<name>
```

สำหรับบอร์ดนี้:

```text
esp32/weather/esp32-weather-001/...
```

ข้อควรระวัง: HiveMQ public broker เป็น broker สาธารณะ เหมาะสำหรับทดสอบ ไม่ควรส่งข้อมูลลับหรือใช้กับ production โดยไม่มี authentication/TLS

## Topic MQTT ทั้งหมด

### Telemetry

| Topic | Retain | ความหมาย |
| --- | --- | --- |
| `esp32/weather/esp32-weather-001/telemetry/status` | Yes | WiFi, IP, RSSI, uptime, time |
| `esp32/weather/esp32-weather-001/telemetry/relay` | Yes | สถานะ Relay 1-3 |
| `esp32/weather/esp32-weather-001/telemetry/weather` | No | temperature และ humidity |
| `esp32/weather/esp32-weather-001/telemetry/air` | No | AQI และ PM2.5 |

ตัวอย่าง `telemetry/status`

```json
{
  "board_id": "esp32-weather-001",
  "wifi": "OK",
  "ip": "192.168.1.25",
  "rssi": -55,
  "uptime_ms": 123456,
  "time": "14:35:20"
}
```

ตัวอย่าง `telemetry/relay`

```json
{
  "board_id": "esp32-weather-001",
  "relay1": "OFF",
  "relay2": "ON",
  "relay3": "OFF"
}
```

ตัวอย่าง `telemetry/weather`

```json
{
  "board_id": "esp32-weather-001",
  "province": "Bangkok",
  "country": "TH",
  "temperature_c": 31.4,
  "humidity_percent": 68
}
```

ตัวอย่าง `telemetry/air`

```json
{
  "board_id": "esp32-weather-001",
  "aqi": 2,
  "pm25_ugm3": 12.5
}
```

### Status และ Event

| Topic | Retain | ความหมาย |
| --- | --- | --- |
| `esp32/weather/esp32-weather-001/status` | Yes | online/offline ของบอร์ด ใช้ LWT |
| `esp32/weather/esp32-weather-001/event/relay` | No | event เมื่อ Relay เปลี่ยนสถานะ |

ตัวอย่าง `status`

```json
{
  "board_id": "esp32-weather-001",
  "status": "online"
}
```

ตัวอย่าง `event/relay`

```json
{
  "board_id": "esp32-weather-001",
  "relay": 1,
  "state": "ON",
  "source": "mqtt"
}
```

### Control

ESP32 subscribe:

```text
esp32/weather/esp32-weather-001/control/#
```

สั่ง Relay:

| Topic | Payload | ความหมาย |
| --- | --- | --- |
| `esp32/weather/esp32-weather-001/control/relay/1/set` | `ON`, `OFF`, `TOGGLE`, `1`, `0`, `TRUE`, `FALSE` | สั่ง Relay 1 |
| `esp32/weather/esp32-weather-001/control/relay/2/set` | `ON`, `OFF`, `TOGGLE`, `1`, `0`, `TRUE`, `FALSE` | สั่ง Relay 2 |
| `esp32/weather/esp32-weather-001/control/relay/3/set` | `ON`, `OFF`, `TOGGLE`, `1`, `0`, `TRUE`, `FALSE` | สั่ง Relay 3 |
| `esp32/weather/esp32-weather-001/control/relay/1/toggle` | อะไรก็ได้ | Toggle Relay 1 |
| `esp32/weather/esp32-weather-001/control/relay/2/toggle` | อะไรก็ได้ | Toggle Relay 2 |
| `esp32/weather/esp32-weather-001/control/relay/3/toggle` | อะไรก็ได้ | Toggle Relay 3 |

ตัวอย่างเปิด Relay 1:

```text
Topic:   esp32/weather/esp32-weather-001/control/relay/1/set
Payload: ON
```

ตัวอย่างปิด Relay 2:

```text
Topic:   esp32/weather/esp32-weather-001/control/relay/2/set
Payload: OFF
```

ตัวอย่าง toggle Relay 3:

```text
Topic:   esp32/weather/esp32-weather-001/control/relay/3/toggle
Payload: toggle
```

## วิธีเปิดด้วย VS Code

1. ติดตั้ง Visual Studio Code
2. ติดตั้ง extension `PlatformIO IDE`
3. เลือก `File > Open Folder...`
4. เปิดโฟลเดอร์นี้

```text
c:\Users\SMARTYYY\Documents\PlatformIO\Projects\ESP32-FIrstproject
```

5. ใช้ปุ่ม `Build`, `Upload`, `Serial Monitor` จาก PlatformIO toolbar

Serial Monitor ใช้ `115200 baud`

## การทดสอบ MQTT

ใช้ MQTT client ใดก็ได้ เช่น MQTTX, MQTT Explorer หรือ mosquitto client

Subscribe ทั้งบอร์ด:

```text
esp32/weather/esp32-weather-001/#
```

Publish เพื่อเปิด Relay 1:

```text
Topic: esp32/weather/esp32-weather-001/control/relay/1/set
Payload: ON
```

ดู event ตอบกลับ:

```text
esp32/weather/esp32-weather-001/event/relay
```

## การแก้ปัญหา

### MQTT ไม่ต่อ

- ตรวจว่า ESP32 ต่อ WiFi และออก internet ได้
- ดู Serial Monitor ว่ามี `MQTT connected.` หรือ `MQTT connect failed`
- ตรวจว่า network ไม่ block port `1883`
- HiveMQ public broker อาจหนาแน่นหรือช้าเป็นบางช่วง

### MQTT control แล้ว Relay ไม่ทำงาน

- ตรวจ topic ต้องมี `BOARD_ID` ตรงกับโค้ด
- ตรวจ payload เช่น `ON`, `OFF`, `TOGGLE`
- subscribe `esp32/weather/esp32-weather-001/event/relay` เพื่อดู event ตอบกลับ

### OLED แสดงเวลา `--:--:--`

- ตรวจว่า WiFi ต่อ internet ได้
- ดู Serial Monitor ว่ามี `NTP time synced:` หรือ `NTP sync failed.`

### กด SW1 แล้วไม่ reset WiFi

- ตรวจ external pull-up ของ `GPIO 34`
- เปิด Serial Monitor แล้วดูว่าขึ้น `SW1 pressed. Hold 5 seconds to reset WiFi.`

### Telegram ไม่ส่ง

- ตรวจ token/chat id
- ตรวจว่า ESP32 ต่อ internet ได้
- ดู Serial Monitor ว่ามี `Telegram API HTTP error` หรือไม่

## สถานะล่าสุด

เอกสารนี้ครอบคลุมฟีเจอร์ปัจจุบัน:

- OLED
- Relay
- WiFiManager
- OpenWeather
- Telegram
- MQTT HiveMQ
- NTP เวลาไทย
