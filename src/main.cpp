#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#if __has_include("../include/private_config.h")
#include "../include/private_config.h"
#endif

#ifndef BOARD_ID_VALUE
#define BOARD_ID_VALUE "esp32-weather-smartyyy-8f42"
#endif

#ifndef OPENWEATHER_API_KEY_VALUE
#define OPENWEATHER_API_KEY_VALUE "PUT_YOUR_OPENWEATHER_API_KEY_HERE"
#endif

#ifndef TELEGRAM_BOT_TOKEN_VALUE
#define TELEGRAM_BOT_TOKEN_VALUE "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE"
#endif

#ifndef TELEGRAM_CHAT_ID_VALUE
#define TELEGRAM_CHAT_ID_VALUE "PUT_YOUR_TELEGRAM_CHAT_ID_HERE"
#endif

const char* BOARD_ID = BOARD_ID_VALUE;
const char* OPENWEATHER_API_KEY = OPENWEATHER_API_KEY_VALUE;
const char* PROVINCE_NAME = "Bangkok";
const char* COUNTRY_CODE = "TH";
const char* TELEGRAM_BOT_TOKEN = TELEGRAM_BOT_TOKEN_VALUE;
const char* TELEGRAM_CHAT_ID = TELEGRAM_CHAT_ID_VALUE;
const unsigned long WEATHER_INTERVAL_MS = 120000UL;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL;
const unsigned long OLED_REFRESH_MS = 1000UL;
const unsigned long WIFI_RESET_HOLD_MS = 5000UL;
const unsigned long MQTT_RETRY_INTERVAL_MS = 5000UL;
const unsigned long MQTT_STATUS_INTERVAL_MS = 30000UL;
const char* WIFI_MANAGER_AP_NAME = "ESP32-Weather-Setup";
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;
const char* MQTT_BASE_TOPIC = "esp32/weather";
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

const int OLED_SDA_PIN = 21;
const int OLED_SCL_PIN = 22;
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;
const int OLED_RESET = -1;
const int OLED_ADDRESS = 0x3C;

unsigned long lastWeatherRead = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastOledRefresh = 0;
unsigned long lastMqttRetry = 0;
unsigned long lastMqttStatus = 0;

const int RELAY1_PIN = 17;
const int RELAY2_PIN = 16;
const int RELAY3_PIN = 4;

const int SW1_PIN = 34;
const int SW2_PIN = 35;
const int SW3_PIN = 32;

bool relay1State = false;
bool relay2State = false;
bool relay3State = false;
bool oledReady = false;
bool sw1ResetTriggered = false;
bool timeReady = false;
bool relay2AutoOffActive = false;
unsigned long relay2AutoOffAt = 0;

int lastReading1 = HIGH, stableState1 = HIGH;
int lastReading2 = HIGH, stableState2 = HIGH;
int lastReading3 = HIGH, stableState3 = HIGH;
unsigned long sw1PressedAt = 0;
unsigned long lastDebounceTime1 = 0;
unsigned long lastDebounceTime2 = 0;
unsigned long lastDebounceTime3 = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50UL;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiManager wifiManager;
WiFiClient mqttWifiClient;
PubSubClient mqttClient(mqttWifiClient);

struct WeatherData {
  float temperature = NAN;
  int humidity = -1;
  int aqi = 0;
  float pm25 = NAN;
  bool weatherReady = false;
  bool airReady = false;
};

WeatherData latestWeather;

const char* aqiText(int aqi);
void notifyRelayChange(const char* label, bool relayState);
void publishRelayTelemetry();
void publishStatusTelemetry();
void publishWeatherTelemetry();
void resetWiFiAndStartPortal();
unsigned long relay2AutoOffRemainingSeconds();
void handleRelay2AutoOff();

String currentTimeText() {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 10)) {
    return "--:--:--";
  }

  char buffer[9];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", &timeInfo);
  return String(buffer);
}

void drawRelayBadge(int x, int y, const char* label, bool isOn) {
  display.drawRoundRect(x, y, 38, 11, 2, SSD1306_WHITE);
  if (isOn) {
    display.fillRect(x + 1, y + 1, 36, 9, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
  } else {
    display.setTextColor(SSD1306_WHITE);
  }
  display.setCursor(x + 4, y + 2);
  display.print(label);
  display.print(isOn ? ":ON" : ":--");
  display.setTextColor(SSD1306_WHITE);
}

void drawOled() {
  if (!oledReady) {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.fillRect(0, 0, SCREEN_WIDTH, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(2, 2);
  display.print(PROVINCE_NAME);
  display.setCursor(68, 2);
  display.print(WiFi.status() == WL_CONNECTED ? "WIFI OK" : "WIFI NO OK");
  display.setTextColor(SSD1306_WHITE);

  display.drawLine(0, 39, SCREEN_WIDTH, 39, SSD1306_WHITE);
  display.setCursor(0, 17);
  display.print("Temp");
  display.setCursor(36, 17);
  if (latestWeather.weatherReady && !isnan(latestWeather.temperature)) {
    display.print(latestWeather.temperature, 1);
    display.print(" C");
  } else {
    display.print("--.- C");
  }

  display.setCursor(0, 29);
  display.print("Hum");
  display.setCursor(36, 29);
  if (latestWeather.weatherReady && latestWeather.humidity >= 0) {
    display.print(latestWeather.humidity);
    display.print(" %");
  } else {
    display.print("-- %");
  }

  display.setCursor(76, 17);
  display.print("AQI");
  display.setCursor(102, 17);
  if (latestWeather.airReady && latestWeather.aqi > 0) {
    display.print(latestWeather.aqi);
  } else {
    display.print("-");
  }

  display.setCursor(76, 29);
  display.print("PM");
  display.setCursor(96, 29);
  if (latestWeather.airReady && !isnan(latestWeather.pm25)) {
    display.print(latestWeather.pm25, 1);
  } else {
    display.print("--.-");
  }

  display.setCursor(0, 43);
  display.print("Time ");
  display.print(currentTimeText());
  drawRelayBadge(0, 53, "R1", relay1State);
  drawRelayBadge(45, 53, "R2", relay2State);
  drawRelayBadge(90, 53, "R3", relay3State);

  display.display();
}

void initOled() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  oledReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);
  if (!oledReady) {
    Serial.println("OLED init failed. Check wiring/address 0x3C.");
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ESP32 Weather");
  display.println("OLED Ready");
  display.display();
  delay(800);
}

void showMessage(const char* line1, const char* line2 = nullptr, const char* line3 = nullptr) {
  if (!oledReady) {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);
  if (line2 != nullptr) {
    display.println(line2);
  }
  if (line3 != nullptr) {
    display.println(line3);
  }
  display.display();
}

bool isSwitchPressed(int swPin) {
  return digitalRead(swPin) == LOW;
}

bool syncNtpTime() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("NTP skipped because WiFi is not connected.");
    return false;
  }

  Serial.println("Syncing time from NTP for Asia/Bangkok...");
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);

  struct tm timeInfo;
  for (int i = 0; i < 10; i++) {
    if (getLocalTime(&timeInfo, 500)) {
      timeReady = true;
      Serial.print("NTP time synced: ");
      Serial.println(currentTimeText());
      return true;
    }
    delay(200);
  }

  timeReady = false;
  Serial.println("NTP sync failed. Will show --:--:-- until time is available.");
  return false;
}

String mqttTopic(const char* suffix) {
  String topic = MQTT_BASE_TOPIC;
  topic += "/";
  topic += BOARD_ID;
  topic += "/";
  topic += suffix;
  return topic;
}

void publishMqttJson(const char* suffix, JsonDocument &doc, bool retained = false) {
  if (!mqttClient.connected()) {
    return;
  }

  char payload[384];
  const size_t length = serializeJson(doc, payload, sizeof(payload));
  if (length == 0 || length >= sizeof(payload)) {
    Serial.println("MQTT payload too large or empty.");
    return;
  }

  const String topic = mqttTopic(suffix);
  if (mqttClient.publish(topic.c_str(), payload, retained)) {
    Serial.print("MQTT publish: ");
    Serial.println(topic);
  } else {
    Serial.print("MQTT publish failed: ");
    Serial.println(topic);
  }
}

void setRelayState(int relayNumber, bool newState, const char* source) {
  bool *relayState = nullptr;
  int relayPin = -1;
  const char* label = "";

  switch (relayNumber) {
    case 1:
      relayState = &relay1State;
      relayPin = RELAY1_PIN;
      label = "Relay 1";
      break;
    case 2:
      relayState = &relay2State;
      relayPin = RELAY2_PIN;
      label = "Relay 2";
      break;
    case 3:
      relayState = &relay3State;
      relayPin = RELAY3_PIN;
      label = "Relay 3";
      break;
    default:
      Serial.println("Invalid relay number.");
      return;
  }

  if (relayNumber == 2 && !newState) {
    relay2AutoOffActive = false;
  }

  if (*relayState == newState) {
    return;
  }

  *relayState = newState;
  digitalWrite(relayPin, *relayState ? LOW : HIGH);

  Serial.print(label);
  Serial.print(" -> ");
  Serial.print(*relayState ? "ON" : "OFF");
  Serial.print(" by ");
  Serial.println(source);

  drawOled();
  notifyRelayChange(label, *relayState);
  publishRelayTelemetry();

  JsonDocument event;
  event["board_id"] = BOARD_ID;
  event["relay"] = relayNumber;
  event["state"] = *relayState ? "ON" : "OFF";
  event["source"] = source;
  publishMqttJson("event/relay", event);
}

void toggleRelayState(int relayNumber, const char* source) {
  switch (relayNumber) {
    case 1:
      setRelayState(1, !relay1State, source);
      break;
    case 2:
      setRelayState(2, !relay2State, source);
      break;
    case 3:
      setRelayState(3, !relay3State, source);
      break;
    default:
      Serial.println("Invalid relay number.");
      break;
  }
}

void handleMqttRelayCommand(int relayNumber, const String &payload) {
  String command = payload;
  command.trim();
  command.toUpperCase();

  if (relayNumber == 2 && command.startsWith("ON_FOR:")) {
    const unsigned long durationSeconds = command.substring(7).toInt();
    if (durationSeconds < 1 || durationSeconds > 86400UL) {
      Serial.println("Relay 2 timer must be between 1 and 86400 seconds.");
      return;
    }

    setRelayState(2, true, "mqtt-timer");
    relay2AutoOffActive = true;
    relay2AutoOffAt = millis() + (durationSeconds * 1000UL);
    publishRelayTelemetry();
    Serial.print("Relay 2 auto-off set for ");
    Serial.print(durationSeconds);
    Serial.println(" seconds.");
  } else if (command == "ON" || command == "1" || command == "TRUE") {
    if (relayNumber == 2) {
      relay2AutoOffActive = false;
    }
    setRelayState(relayNumber, true, "mqtt");
  } else if (command == "OFF" || command == "0" || command == "FALSE") {
    setRelayState(relayNumber, false, "mqtt");
  } else if (command == "TOGGLE") {
    toggleRelayState(relayNumber, "mqtt");
  } else {
    Serial.print("Unknown MQTT relay command: ");
    Serial.println(payload);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicText = topic;
  String payloadText;
  payloadText.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    payloadText += static_cast<char>(payload[i]);
  }

  Serial.print("MQTT message: ");
  Serial.print(topicText);
  Serial.print(" = ");
  Serial.println(payloadText);

  const String wifiManagerTopic = mqttTopic("control/wifi/manager");
  if (topicText == wifiManagerTopic) {
    String command = payloadText;
    command.trim();
    command.toUpperCase();

    if (command == "START" || command == "RESET" || command == "1" || command == "TRUE") {
      Serial.println("MQTT WiFi Manager command received.");
      resetWiFiAndStartPortal();
    } else {
      Serial.print("Unknown MQTT WiFi Manager command: ");
      Serial.println(payloadText);
    }
    return;
  }

  const String prefix = mqttTopic("control/relay/");
  if (!topicText.startsWith(prefix)) {
    return;
  }

  const String suffix = topicText.substring(prefix.length());
  const int slashIndex = suffix.indexOf('/');
  if (slashIndex < 0) {
    return;
  }

  const int relayNumber = suffix.substring(0, slashIndex).toInt();
  const String action = suffix.substring(slashIndex + 1);

  if (action == "set") {
    handleMqttRelayCommand(relayNumber, payloadText);
  } else if (action == "toggle") {
    toggleRelayState(relayNumber, "mqtt");
  }
}

void publishRelayTelemetry() {
  JsonDocument doc;
  doc["board_id"] = BOARD_ID;
  doc["uptime_ms"] = millis();
  doc["relay1"] = relay1State ? "ON" : "OFF";
  doc["relay2"] = relay2State ? "ON" : "OFF";
  doc["relay3"] = relay3State ? "ON" : "OFF";
  doc["relay2_auto_off_remaining_sec"] = relay2AutoOffRemainingSeconds();
  publishMqttJson("telemetry/relay", doc, true);
}

void publishStatusTelemetry() {
  JsonDocument doc;
  doc["board_id"] = BOARD_ID;
  doc["wifi"] = WiFi.status() == WL_CONNECTED ? "OK" : "NO OK";
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["uptime_ms"] = millis();
  doc["time"] = currentTimeText();
  publishMqttJson("telemetry/status", doc, true);
}

void publishWeatherTelemetry() {
  JsonDocument weatherDoc;
  weatherDoc["board_id"] = BOARD_ID;
  weatherDoc["province"] = PROVINCE_NAME;
  weatherDoc["country"] = COUNTRY_CODE;
  if (latestWeather.weatherReady && !isnan(latestWeather.temperature)) {
    weatherDoc["temperature_c"] = latestWeather.temperature;
  } else {
    weatherDoc["temperature_c"] = nullptr;
  }
  if (latestWeather.weatherReady && latestWeather.humidity >= 0) {
    weatherDoc["humidity_percent"] = latestWeather.humidity;
  } else {
    weatherDoc["humidity_percent"] = nullptr;
  }
  publishMqttJson("telemetry/weather", weatherDoc, true);

  JsonDocument airDoc;
  airDoc["board_id"] = BOARD_ID;
  if (latestWeather.airReady && latestWeather.aqi > 0) {
    airDoc["aqi"] = latestWeather.aqi;
  } else {
    airDoc["aqi"] = nullptr;
  }
  if (latestWeather.airReady && !isnan(latestWeather.pm25)) {
    airDoc["pm25_ugm3"] = latestWeather.pm25;
  } else {
    airDoc["pm25_ugm3"] = nullptr;
  }
  publishMqttJson("telemetry/air", airDoc, true);
}

void publishMqttOnlineStatus(bool isOnline) {
  if (!mqttClient.connected()) {
    return;
  }

  JsonDocument doc;
  doc["board_id"] = BOARD_ID;
  doc["status"] = isOnline ? "online" : "offline";
  publishMqttJson("status", doc, true);
}

bool connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  if (mqttClient.connected()) {
    return true;
  }

  const String clientId = String(BOARD_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  const String willTopic = mqttTopic("status");
  const String controlTopic = mqttTopic("control/#");
  const String offlinePayload = String("{\"board_id\":\"") + BOARD_ID + "\",\"status\":\"offline\"}";

  Serial.print("Connecting MQTT: ");
  Serial.println(MQTT_SERVER);

  if (mqttClient.connect(clientId.c_str(), willTopic.c_str(), 0, true, offlinePayload.c_str())) {
    Serial.println("MQTT connected.");
    mqttClient.subscribe(controlTopic.c_str());
    Serial.print("MQTT subscribe: ");
    Serial.println(controlTopic);
    publishMqttOnlineStatus(true);
    publishStatusTelemetry();
    publishRelayTelemetry();
    publishWeatherTelemetry();
    return true;
  }

  Serial.print("MQTT connect failed, state: ");
  Serial.println(mqttClient.state());
  return false;
}

void handleMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (!mqttClient.connected()) {
    const unsigned long now = millis();
    if ((now - lastMqttRetry) >= MQTT_RETRY_INTERVAL_MS) {
      lastMqttRetry = now;
      connectMqtt();
    }
    return;
  }

  mqttClient.loop();

  const unsigned long now = millis();
  if ((now - lastMqttStatus) >= MQTT_STATUS_INTERVAL_MS) {
    lastMqttStatus = now;
    publishStatusTelemetry();
    publishRelayTelemetry();
  }
}

unsigned long relay2AutoOffRemainingSeconds() {
  if (!relay2AutoOffActive || !relay2State) {
    return 0;
  }

  const long remainingMs = static_cast<long>(relay2AutoOffAt - millis());
  if (remainingMs <= 0) {
    return 0;
  }

  return (static_cast<unsigned long>(remainingMs) + 999UL) / 1000UL;
}

void handleRelay2AutoOff() {
  if (!relay2AutoOffActive) {
    return;
  }

  if (static_cast<long>(millis() - relay2AutoOffAt) >= 0) {
    relay2AutoOffActive = false;
    setRelayState(2, false, "auto-timer");
  }
}

bool isTelegramReady() {
  return strcmp(TELEGRAM_BOT_TOKEN, "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE") != 0 &&
         strcmp(TELEGRAM_CHAT_ID, "PUT_YOUR_TELEGRAM_CHAT_ID_HERE") != 0;
}

bool sendTelegramMessage(const String &message) {
  if (!isTelegramReady()) {
    Serial.println("Telegram is not configured. Skip notification.");
    return false;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Telegram skipped because WiFi is not connected.");
    return false;
  }

  WiFiClientSecure client;
  HTTPClient http;
  client.setInsecure();

  String url = "https://api.telegram.org/bot";
  url += TELEGRAM_BOT_TOKEN;
  url += "/sendMessage";

  JsonDocument doc;
  doc["chat_id"] = TELEGRAM_CHAT_ID;
  doc["text"] = message;
  doc["disable_web_page_preview"] = true;

  String body;
  serializeJson(doc, body);

  http.setTimeout(10000);
  if (!http.begin(client, url)) {
    Serial.println("Telegram API begin failed.");
    return false;
  }

  http.addHeader("Content-Type", "application/json; charset=utf-8");
  const int httpCode = http.POST(body);
  http.end();

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("Telegram notification sent.");
    return true;
  }

  Serial.print("Telegram API HTTP error: ");
  Serial.println(httpCode);
  return false;
}

void notifyRelayChange(const char* label, bool relayState) {
  String message = "ESP32 Relay Alert\n";
  message += label;
  message += relayState ? " -> ON" : " -> OFF";
  sendTelegramMessage(message);
}

void notifyWeatherReport() {
  String message = "ESP32 Weather Report\n";
  message += PROVINCE_NAME;
  message += ", ";
  message += COUNTRY_CODE;
  message += "\nWiFi: ";
  message += WiFi.status() == WL_CONNECTED ? "OK" : "NO OK";
  message += "\nTime: ";
  message += currentTimeText();
  message += "\nTemp: ";
  message += latestWeather.weatherReady && !isnan(latestWeather.temperature) ? String(latestWeather.temperature, 1) + " C" : "--.- C";
  message += "\nHumidity: ";
  message += latestWeather.weatherReady && latestWeather.humidity >= 0 ? String(latestWeather.humidity) + " %" : "-- %";
  message += "\nAQI: ";
  message += latestWeather.airReady && latestWeather.aqi > 0 ? String(latestWeather.aqi) + " (" + aqiText(latestWeather.aqi) + ")" : "-";
  message += "\nPM2.5: ";
  message += latestWeather.airReady && !isnan(latestWeather.pm25) ? String(latestWeather.pm25, 1) + " ug/m3" : "--.- ug/m3";
  sendTelegramMessage(message);
}

void clearSavedWiFiSettings() {
  Serial.println("Resetting saved WiFi settings.");
  showMessage("Resetting WiFi", "settings...");
  sendTelegramMessage("ESP32 WiFi settings reset.");
  wifiManager.resetSettings();
  WiFi.disconnect(true, true);
  delay(1000);
}

void resetWiFiIfSw1HeldOnStartup() {
  if (!isSwitchPressed(SW1_PIN)) {
    return;
  }

  Serial.println("SW1 pressed on startup. Hold for 5 seconds to reset WiFi settings.");
  showMessage("Hold SW1", "5 sec reset WiFi");

  const unsigned long start = millis();
  while ((millis() - start) < WIFI_RESET_HOLD_MS) {
    if (!isSwitchPressed(SW1_PIN)) {
      Serial.println("SW1 released before 5 seconds. WiFi settings kept.");
      showMessage("WiFi reset canceled");
      delay(700);
      return;
    }
    delay(50);
  }

  clearSavedWiFiSettings();
}

bool startWiFiManager() {
  WiFi.mode(WIFI_STA);
  wifiManager.setConnectTimeout(15);
  wifiManager.setConfigPortalTimeout(180);

  Serial.println("Starting WiFiManager.");
  Serial.print("Config AP: ");
  Serial.println(WIFI_MANAGER_AP_NAME);
  showMessage("Connecting WiFi", "AP if needed:", WIFI_MANAGER_AP_NAME);

  if (wifiManager.autoConnect(WIFI_MANAGER_AP_NAME)) {
    Serial.print("WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
    syncNtpTime();
    showMessage("WiFi connected", WiFi.localIP().toString().c_str());
    connectMqtt();
    sendTelegramMessage("ESP32 connected to WiFi.\nIP: " + WiFi.localIP().toString());
    delay(800);
    return true;
  }

  Serial.println("WiFiManager timed out. Will retry in loop.");
  showMessage("WiFi not set", "Will retry later");
  delay(800);
  return false;
}

void resetWiFiAndStartPortal() {
  clearSavedWiFiSettings();
  startWiFiManager();
  lastWifiRetry = millis();
  lastWeatherRead = millis();
  drawOled();
}

void handleSwitch(int swPin, int &lastReading, int &stableState, unsigned long &lastDebounce, bool &relayState, int relayPin, const char* label) {
  const int currentReading = digitalRead(swPin);

  if (currentReading != lastReading) {
    lastDebounce = millis();
  }

  if ((millis() - lastDebounce) > DEBOUNCE_DELAY_MS) {
    if (currentReading != stableState) {
      stableState = currentReading;

      if (stableState == LOW) {
        if (relayPin == RELAY2_PIN) {
          toggleRelayState(2, "switch");
        } else if (relayPin == RELAY3_PIN) {
          toggleRelayState(3, "switch");
        }
      }
    }
  }

  lastReading = currentReading;
}

void handleSw1() {
  const int currentReading = digitalRead(SW1_PIN);

  if (currentReading != lastReading1) {
    lastDebounceTime1 = millis();
  }

  if ((millis() - lastDebounceTime1) > DEBOUNCE_DELAY_MS) {
    if (currentReading != stableState1) {
      stableState1 = currentReading;

      if (stableState1 == LOW) {
        sw1PressedAt = millis();
        sw1ResetTriggered = false;
        Serial.println("SW1 pressed. Hold 5 seconds to reset WiFi.");
      } else if (!sw1ResetTriggered) {
        toggleRelayState(1, "switch");
      }
    }

    if (stableState1 == LOW && !sw1ResetTriggered && (millis() - sw1PressedAt) >= WIFI_RESET_HOLD_MS) {
      sw1ResetTriggered = true;
      Serial.println("SW1 held for 5 seconds. Reset WiFi now.");
      resetWiFiAndStartPortal();
    }
  }

  lastReading1 = currentReading;
}

const char* aqiText(int aqi) {
  switch (aqi) {
    case 1:
      return "Good";
    case 2:
      return "Fair";
    case 3:
      return "Moderate";
    case 4:
      return "Poor";
    case 5:
      return "Very Poor";
    default:
      return "Unknown";
  }
}

bool connectWiFi(unsigned long timeoutMs = 15000UL) {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println("Reconnecting WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.reconnect();

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
    syncNtpTime();
    connectMqtt();
    return true;
  }

  Serial.println();
  Serial.println("WiFi connect failed. Will retry later.");
  return false;
}

bool fetchWeather(float &temperature, int &humidity, const char* &description, float &lat, float &lon) {
  WiFiClient client;
  HTTPClient http;

  String url = "http://api.openweathermap.org/data/2.5/weather?q=";
  url += PROVINCE_NAME;
  url += ",";
  url += COUNTRY_CODE;
  url += "&appid=";
  url += OPENWEATHER_API_KEY;
  url += "&units=metric&lang=en";

  http.setTimeout(10000);
  if (!http.begin(client, url)) {
    Serial.println("Weather API begin failed.");
    return false;
  }

  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.print("Weather API HTTP error: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, http.getStream());
  http.end();

  if (error) {
    Serial.print("Weather JSON error: ");
    Serial.println(error.c_str());
    return false;
  }

  temperature = doc["main"]["temp"] | NAN;
  humidity = doc["main"]["humidity"] | -1;
  description = doc["weather"][0]["description"] | "unknown";
  lat = doc["coord"]["lat"] | NAN;
  lon = doc["coord"]["lon"] | NAN;

  if (isnan(lat) || isnan(lon)) {
    Serial.println("Weather API did not return location coordinates.");
    return false;
  }

  return true;
}

bool fetchAirQuality(float lat, float lon, int &aqi, float &pm25, float &pm10) {
  WiFiClient client;
  HTTPClient http;

  String url = "http://api.openweathermap.org/data/2.5/air_pollution?lat=";
  url += String(lat, 4);
  url += "&lon=";
  url += String(lon, 4);
  url += "&appid=";
  url += OPENWEATHER_API_KEY;

  http.setTimeout(10000);
  if (!http.begin(client, url)) {
    Serial.println("Air Pollution API begin failed.");
    return false;
  }

  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.print("Air Pollution API HTTP error: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, http.getStream());
  http.end();

  if (error) {
    Serial.print("Air Pollution JSON error: ");
    Serial.println(error.c_str());
    return false;
  }

  JsonObject item = doc["list"][0];
  aqi = item["main"]["aqi"] | 0;
  pm25 = item["components"]["pm2_5"] | NAN;
  pm10 = item["components"]["pm10"] | NAN;
  return true;
}

void readBangkokWeather() {
  Serial.println();
  Serial.println("================================");
  Serial.print(PROVINCE_NAME);
  Serial.println(" Weather / Air Quality");

  if (!connectWiFi()) {
    Serial.println("Skip API read because WiFi is not connected.");
    return;
  }

  float temperature = NAN;
  int humidity = -1;
  const char* description = "unknown";
  float lat = NAN;
  float lon = NAN;
  int aqi = 0;
  float pm25 = NAN;
  float pm10 = NAN;

  if (fetchWeather(temperature, humidity, description, lat, lon)) {
    latestWeather.temperature = temperature;
    latestWeather.humidity = humidity;
    latestWeather.weatherReady = true;

    Serial.print("Weather: ");
    Serial.println(description);
    Serial.print("Temperature: ");
    Serial.print(temperature, 1);
    Serial.println(" C");
    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  }

  if (!isnan(lat) && !isnan(lon) && fetchAirQuality(lat, lon, aqi, pm25, pm10)) {
    latestWeather.aqi = aqi;
    latestWeather.pm25 = pm25;
    latestWeather.airReady = true;

    Serial.print("AQI: ");
    Serial.print(aqi);
    Serial.print(" (");
    Serial.print(aqiText(aqi));
    Serial.println(")");
    Serial.print("PM2.5: ");
    Serial.print(pm25, 2);
    Serial.println(" ug/m3");
    Serial.print("PM10: ");
    Serial.print(pm10, 2);
    Serial.println(" ug/m3");
  }

  Serial.println("Next read in 2 minutes.");
  Serial.println("================================");
  drawOled();
  publishWeatherTelemetry();
  notifyWeatherReport();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 OpenWeather program started.");
  Serial.println("Open Serial Monitor at 115200 baud.");
  initOled();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(RELAY3_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  pinMode(SW1_PIN, INPUT);
  pinMode(SW2_PIN, INPUT);
  pinMode(SW3_PIN, INPUT);

  resetWiFiIfSw1HeldOnStartup();

  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  digitalWrite(RELAY3_PIN, HIGH);
  digitalWrite(LED_BUILTIN, LOW);

  startWiFiManager();
  readBangkokWeather();
  lastWeatherRead = millis();
}

void loop() {
  handleMqtt();
  handleRelay2AutoOff();
  handleSw1();
  handleSwitch(SW2_PIN, lastReading2, stableState2, lastDebounceTime2, relay2State, RELAY2_PIN, "Relay 2");
  handleSwitch(SW3_PIN, lastReading3, stableState3, lastDebounceTime3, relay3State, RELAY3_PIN, "Relay 3");

  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED && (now - lastWifiRetry) >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetry = now;
    connectWiFi(5000);
  }

  if ((now - lastOledRefresh) >= OLED_REFRESH_MS) {
    lastOledRefresh = now;
    drawOled();
  }

  if ((now - lastWeatherRead) >= WEATHER_INTERVAL_MS) {
    lastWeatherRead = now;
    readBangkokWeather();
  }
}
