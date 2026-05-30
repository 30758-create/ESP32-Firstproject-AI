#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const char* WIFI_SSID = "SOMMAI-2.4G";
const char* WIFI_PASSWORD = "15032519";

const char* OPENWEATHER_API_KEY = "1f61d24ccd551214bcbc61c408cb65bd";
const char* PROVINCE_NAME = "Bangkok";
const char* COUNTRY_CODE = "TH";
const unsigned long WEATHER_INTERVAL_MS = 120000UL;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL;
const unsigned long OLED_REFRESH_MS = 1000UL;

const int OLED_SDA_PIN = 21;
const int OLED_SCL_PIN = 22;
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;
const int OLED_RESET = -1;
const int OLED_ADDRESS = 0x3C;

unsigned long lastWeatherRead = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastOledRefresh = 0;

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

int lastReading1 = HIGH, stableState1 = HIGH;
int lastReading2 = HIGH, stableState2 = HIGH;
int lastReading3 = HIGH, stableState3 = HIGH;
unsigned long lastDebounceTime1 = 0;
unsigned long lastDebounceTime2 = 0;
unsigned long lastDebounceTime3 = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50UL;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

struct WeatherData {
  float temperature = NAN;
  int humidity = -1;
  int aqi = 0;
  float pm25 = NAN;
  bool weatherReady = false;
  bool airReady = false;
};

WeatherData latestWeather;

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
  display.setCursor(88, 2);
  display.print(WiFi.status() == WL_CONNECTED ? "WiFi OK" : "NO WIFI");
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
  display.print("Relay Status");
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

void handleSwitch(int swPin, int &lastReading, int &stableState, unsigned long &lastDebounce, bool &relayState, int relayPin, const char* label) {
  const int currentReading = digitalRead(swPin);

  if (currentReading != lastReading) {
    lastDebounce = millis();
  }

  if ((millis() - lastDebounce) > DEBOUNCE_DELAY_MS) {
    if (currentReading != stableState) {
      stableState = currentReading;

      if (stableState == LOW) {
        relayState = !relayState;
        digitalWrite(relayPin, relayState ? LOW : HIGH);
        Serial.print(label);
        Serial.println(relayState ? " -> ON" : " -> OFF");
        drawOled();
      }
    }
  }

  lastReading = currentReading;
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

  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected, IP: ");
    Serial.println(WiFi.localIP());
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
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 OpenWeather program started.");
  Serial.println("Open Serial Monitor at 115200 baud.");
  initOled();

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  pinMode(RELAY3_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  pinMode(SW1_PIN, INPUT);
  pinMode(SW2_PIN, INPUT);
  pinMode(SW3_PIN, INPUT);

  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  digitalWrite(RELAY3_PIN, HIGH);
  digitalWrite(LED_BUILTIN, LOW);

  readBangkokWeather();
  lastWeatherRead = millis();
}

void loop() {
  handleSwitch(SW1_PIN, lastReading1, stableState1, lastDebounceTime1, relay1State, RELAY1_PIN, "Relay 1");
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
