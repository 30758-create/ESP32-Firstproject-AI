# ESP32 OpenWeather Local Dashboard

Local web dashboard for the ESP32 OpenWeather Station. It reads MQTT telemetry from the ESP32 and publishes relay commands back to the same broker.

## Run

```powershell
cd dashboard
npm install
npm start
```

Open:

```text
http://localhost:3000/mission-control
```

The root URL also works:

```text
http://localhost:3000
```

## MQTT defaults

```text
Broker: mqtt://broker.hivemq.com:1883
Board ID: esp32-weather-001
Base topic: esp32/weather
```

Override with environment variables:

```powershell
$env:MQTT_URL="mqtt://broker.hivemq.com:1883"
$env:BOARD_ID="esp32-weather-001"
$env:MQTT_BASE_TOPIC="esp32/weather"
npm start
```

For a public cloud dashboard, set a PIN for relay and WiFi Manager commands:

```powershell
$env:DASHBOARD_PIN="change-this-pin"
npm start
```

On Render, add `DASHBOARD_PIN` as an environment variable.

## Telemetry topics

```text
esp32/weather/esp32-weather-001/telemetry/weather
esp32/weather/esp32-weather-001/telemetry/air
esp32/weather/esp32-weather-001/telemetry/status
esp32/weather/esp32-weather-001/telemetry/relay
esp32/weather/esp32-weather-001/status
```

## Relay command topics

```text
esp32/weather/esp32-weather-001/control/relay/1/set
esp32/weather/esp32-weather-001/control/relay/2/set
esp32/weather/esp32-weather-001/control/relay/3/set
```

Payload values:

```text
ON
OFF
TOGGLE
```

## WiFi Manager command topic

The dashboard button publishes:

```text
esp32/weather/esp32-weather-001/control/wifi/manager
```

Payload:

```text
START
```

The ESP32 clears saved WiFi settings and opens the WiFiManager portal AP:

```text
ESP32-Weather-Setup
```
