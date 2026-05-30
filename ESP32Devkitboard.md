# รายละเอียดบอร์ด ESP32 DevKit และการต่อวงจร

เอกสารนี้สรุปข้อมูลฮาร์ดแวร์ที่เกี่ยวข้องกับโปรเจกต์ ESP32 Weather, Air Quality, Relay, WiFiManager และ Telegram โดยเน้นบอร์ด `esp32doit-devkit-v1` ตามที่กำหนดใน `platformio.ini`

## บอร์ดที่ใช้

```ini
board = esp32doit-devkit-v1
framework = arduino
```

บอร์ดกลุ่ม ESP32 DevKit V1 มักใช้โมดูล ESP32-WROOM-32 มี WiFi 2.4 GHz และ Bluetooth ในตัว เหมาะกับงาน IoT ที่ต้องเชื่อมต่อ internet และควบคุมอุปกรณ์ภายนอก

## ข้อมูลสำคัญของ ESP32

- Logic level ของ GPIO คือ `3.3V`
- ไม่ควรป้อนสัญญาณ `5V` เข้าขา GPIO โดยตรง
- ใช้ไฟเลี้ยงผ่าน USB หรือ Vin ตามสเปกของบอร์ด
- เมื่อใช้ WiFi ควรมีแหล่งจ่ายไฟที่นิ่งและจ่ายกระแสได้เพียงพอ
- ESP32 รองรับ WiFi 2.4 GHz ไม่รองรับ WiFi 5 GHz

## GPIO ที่ใช้ในโปรเจกต์

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

โปรเจกต์ใช้จอ OLED SSD1306 ความละเอียด 128x64 ผ่าน I2C

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

ถ้าจอไม่แสดงผล:

- ตรวจสาย `SDA` และ `SCL`
- ตรวจ GND ร่วม
- ตรวจว่า address เป็น `0x3C` หรือ `0x3D`
- ดู Serial Monitor ว่ามีข้อความ `OLED init failed. Check wiring/address 0x3C.` หรือไม่

## Relay Module

Relay ในโปรเจกต์นี้ตั้งเป็น Active Low หมายความว่า:

- สั่ง `LOW` เพื่อเปิด Relay
- สั่ง `HIGH` เพื่อปิด Relay

| Relay | GPIO | สถานะเริ่มต้น |
| --- | ---: | --- |
| Relay 1 | `GPIO 17` | OFF ด้วย `HIGH` |
| Relay 2 | `GPIO 16` | OFF ด้วย `HIGH` |
| Relay 3 | `GPIO 4` | OFF ด้วย `HIGH` |

ตัวอย่าง logic:

```cpp
digitalWrite(RELAY1_PIN, LOW);   // ON
digitalWrite(RELAY1_PIN, HIGH);  // OFF
```

ข้อควรระวัง:

- Relay module บางรุ่นใช้ไฟเลี้ยง 5V แต่ input control อาจรับ 3.3V ได้หรือไม่ได้ ต้องตรวจรุ่นที่ใช้
- ถ้าควบคุมโหลดไฟบ้านหรือ AC ต้องระวังไฟฟ้าแรงสูง
- ควรแยกวงจรไฟแรงสูงกับวงจร ESP32 ให้ปลอดภัย
- ถ้า Relay กินกระแสมาก ไม่ควรใช้ไฟจาก ESP32 โดยตรง

## Switch แบบ Active Low

ปุ่มในโปรเจกต์อ่านค่าแบบ Active Low:

- ไม่กด: `HIGH`
- กด: `LOW`

| Switch | GPIO | การใช้งาน |
| --- | ---: | --- |
| `SW1` | `GPIO 34` | กดสั้นสลับ Relay 1, กดค้าง 5 วินาที reset WiFi |
| `SW2` | `GPIO 35` | กดสลับ Relay 2 |
| `SW3` | `GPIO 32` | กดสลับ Relay 3 |

วงจรปุ่มที่แนะนำ:

```text
3V3 ---[10k resistor]--- GPIO
                         |
                       switch
                         |
                        GND
```

เมื่อไม่กด resistor จะดึงขา GPIO เป็น `HIGH` และเมื่อกดปุ่ม ขา GPIO จะถูกดึงลง `GND` เป็น `LOW`

## ข้อสำคัญของ GPIO 34 และ GPIO 35

`GPIO 34` และ `GPIO 35` เป็น input-only และไม่มี internal pull-up/pull-down ดังนั้นห้ามหวังพึ่ง `INPUT_PULLUP` กับสองขานี้ ต้องใส่ resistor pull-up ภายนอกจริง

ถ้าไม่มี external pull-up อาจเกิดอาการ:

- กดปุ่มแล้ว Serial Monitor ไม่ขึ้น log
- Relay เปลี่ยนเอง
- กด SW1 ค้างแล้วไม่ reset WiFi
- อ่านค่าสถานะปุ่มไม่นิ่ง

## WiFiManager และปุ่ม SW1

โปรแกรมรองรับการ reset WiFi ด้วย `SW1`

- กดค้างตอนเปิดเครื่องครบ 5 วินาที
- หรือกดค้างระหว่างโปรแกรมทำงานครบ 5 วินาที

หลัง reset โปรแกรมจะเปิด Access Point:

```text
ESP32-Weather-Setup
```

แล้วตั้งค่า WiFi ผ่าน browser ที่:

```text
192.168.4.1
```

## OLED Layout

จอ OLED กว้าง 128 pixels สูง 64 pixels ข้อความยาวเกินขอบจะถูกตัด โปรแกรมจึงวางสถานะ WiFi ที่ตำแหน่ง `x = 68`

ข้อความสถานะ:

- `WIFI OK`
- `WIFI NO OK`

ถ้าปรับข้อความให้ยาวขึ้น ต้องลดตำแหน่ง x หรือย่อข้อความเพื่อไม่ให้ล้นจอ

## Serial Monitor

ตั้งค่า baud rate:

```ini
monitor_speed = 115200
```

ข้อความที่ควรเห็นเมื่อระบบทำงาน:

```text
ESP32 OpenWeather program started.
Starting WiFiManager.
WiFi connected, IP: ...
Bangkok Weather / Air Quality
```

เมื่อกด SW1:

```text
SW1 pressed. Hold 5 seconds to reset WiFi.
SW1 held for 5 seconds. Reset WiFi now.
```

## คำแนะนำด้านไฟเลี้ยง

- ใช้สาย USB คุณภาพดี
- ถ้า Relay ทำงานแล้ว ESP32 reset เอง แปลว่าไฟอาจตก
- แนะนำให้ใช้ไฟเลี้ยง Relay แยกจาก ESP32 ถ้าโหลดมาก
- ต้องต่อ GND ร่วมระหว่าง ESP32 กับ relay module เมื่อใช้สัญญาณควบคุมร่วมกัน

## Checklist ก่อนทดสอบ

- OLED ต่อ `SDA = GPIO 21`, `SCL = GPIO 22`
- Relay ต่อถูกขาและรองรับ logic 3.3V
- SW1/SW2 มี external pull-up
- WiFi เป็น 2.4 GHz
- OpenWeather API key ถูกต้อง
- Telegram bot token และ chat id ถูกต้อง ถ้าต้องการใช้ notification
- Serial Monitor ตั้งที่ `115200`
