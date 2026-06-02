const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const BOARD_ID = "esp32-weather-smartyyy-8f42";
const MQTT_BASE_TOPIC = "esp32/weather";
const BOARD_TOPIC = `${MQTT_BASE_TOPIC}/${BOARD_ID}`;
const STALE_AFTER_MS = 90000;
const ACCESS_PIN_SHA256 = "48abb45519bafd93fc621be74eb9b456639e77f21431ac8baec36eb79f54d2a0";

const relayList = document.getElementById("relayList");
const wifiManagerButton = document.getElementById("wifiManagerButton");
const accessGate = document.getElementById("accessGate");
const accessForm = document.getElementById("accessForm");
const accessPin = document.getElementById("accessPin");
const accessError = document.getElementById("accessError");
const relays = [
  { id: 1, key: "relay1", name: "Relay 1" },
  { id: 2, key: "relay2", name: "Relay 2" },
  { id: 3, key: "relay3", name: "Relay 3" }
];

const state = {
  boardId: BOARD_ID,
  mqtt: {
    connected: false,
    lastMessageAt: null
  },
  station: {
    online: false,
    lastStatusAt: null
  },
  weather: {},
  air: {},
  wifi: {},
  relay: {
    relay1: "OFF",
    relay2: "OFF",
    relay3: "OFF"
  },
  events: []
};

let mqttClient = null;
let appStarted = false;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function startApp() {
  if (appStarted) {
    return;
  }

  appStarted = true;
  accessGate.classList.add("hidden");
  renderState();
  connectMqtt();
}

async function verifyAccess(event) {
  event.preventDefault();
  accessError.textContent = "";

  const enteredHash = await sha256(accessPin.value);
  if (enteredHash !== ACCESS_PIN_SHA256) {
    accessError.textContent = "Invalid PIN";
    accessPin.value = "";
    accessPin.focus();
    return;
  }

  startApp();
}

function addEvent(message) {
  state.events.unshift({
    time: new Date().toISOString(),
    message
  });
  state.events = state.events.slice(0, 20);
  renderState();
}

function formatValue(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function formatUptime(ms) {
  if (!Number.isFinite(ms)) {
    return "-";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatTime(isoText) {
  if (!isoText) {
    return "No data";
  }

  return new Date(isoText).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function aqiText(aqi) {
  const labels = {
    1: "Good",
    2: "Fair",
    3: "Moderate",
    4: "Poor",
    5: "Very Poor"
  };
  return labels[aqi] || "Unknown";
}

function setStatus(id, label, isOn) {
  const element = document.getElementById(id);
  element.textContent = label;
  element.className = `pill ${isOn ? "pill-on" : "pill-off"}`;
}

function parsePayload(payload) {
  try {
    return JSON.parse(payload.toString());
  } catch (error) {
    return null;
  }
}

function updateStateFromMqtt(topic, payload) {
  state.mqtt.lastMessageAt = new Date().toISOString();

  if (topic === `${BOARD_TOPIC}/telemetry/weather`) {
    state.weather = payload || {};
  } else if (topic === `${BOARD_TOPIC}/telemetry/air`) {
    state.air = payload || {};
  } else if (topic === `${BOARD_TOPIC}/telemetry/status`) {
    state.wifi = payload || {};
  } else if (topic === `${BOARD_TOPIC}/telemetry/relay`) {
    state.relay = {
      relay1: payload?.relay1 || state.relay.relay1,
      relay2: payload?.relay2 || state.relay.relay2,
      relay3: payload?.relay3 || state.relay.relay3
    };
  } else if (topic === `${BOARD_TOPIC}/status`) {
    state.station.online = payload?.status === "online";
    state.station.lastStatusAt = new Date().toISOString();
  }
}

function publish(topic, message) {
  if (!mqttClient?.connected) {
    alert("MQTT is not connected yet.");
    return;
  }

  mqttClient.publish(topic, message);
}

function sendRelayCommand(relayId, command) {
  const topic = `${BOARD_TOPIC}/control/relay/${relayId}/set`;
  publish(topic, command);
  addEvent(`Relay ${relayId} command: ${command}`);
}

function sendWifiManagerCommand() {
  const confirmed = confirm("Start WiFi Manager portal? ESP32 will clear saved WiFi and open AP: ESP32-Weather-Setup");
  if (!confirmed) {
    return;
  }

  publish(`${BOARD_TOPIC}/control/wifi/manager`, "START");
  addEvent("WiFi Manager command sent");
}

function renderRelays() {
  relayList.innerHTML = "";

  for (const relay of relays) {
    const value = state.relay?.[relay.key] || "OFF";
    const row = document.createElement("div");
    row.className = "relay-row";
    row.innerHTML = `
      <div class="relay-name">
        <span>${relay.name}</span>
        <span class="relay-state ${value === "ON" ? "on" : ""}">${value}</span>
      </div>
      <div class="relay-actions">
        <button class="btn-on" data-command="ON">ON</button>
        <button class="btn-off" data-command="OFF">OFF</button>
        <button class="btn-toggle" data-command="TOGGLE">TOGGLE</button>
      </div>
    `;

    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => sendRelayCommand(relay.id, button.dataset.command));
    });

    relayList.appendChild(row);
  }
}

function renderEvents() {
  const list = document.getElementById("events");
  const visibleEvents = state.events.length
    ? state.events
    : [{ time: new Date().toISOString(), message: "Waiting for MQTT data" }];

  list.innerHTML = "";
  visibleEvents.slice(0, 8).forEach((event) => {
    const item = document.createElement("li");
    item.textContent = `${formatTime(event.time)} - ${event.message}`;
    list.appendChild(item);
  });
}

function renderState() {
  document.getElementById("boardId").textContent = state.boardId;

  setStatus("mqttStatus", state.mqtt.connected ? "MQTT OK" : "MQTT OFF", state.mqtt.connected);
  setStatus("stationStatus", state.station.online ? "Station Online" : "Station Offline", state.station.online);

  document.getElementById("temperature").textContent = Number.isFinite(state.weather.temperature_c)
    ? Number(state.weather.temperature_c).toFixed(1)
    : "--.-";
  document.getElementById("humidity").textContent = Number.isFinite(state.weather.humidity_percent)
    ? state.weather.humidity_percent
    : "--";
  document.getElementById("aqi").textContent = formatValue(state.air.aqi, "-");
  document.getElementById("aqiText").textContent = aqiText(state.air.aqi);
  document.getElementById("pm25").textContent = Number.isFinite(state.air.pm25_ugm3)
    ? Number(state.air.pm25_ugm3).toFixed(1)
    : "--.-";

  document.getElementById("wifiState").textContent = formatValue(state.wifi.wifi, "NO OK");
  document.getElementById("ipAddress").textContent = formatValue(state.wifi.ip);
  document.getElementById("rssi").textContent = Number.isFinite(state.wifi.rssi) ? `${state.wifi.rssi} dBm` : "-";
  document.getElementById("stationTime").textContent = formatValue(state.wifi.time, "--:--:--");
  document.getElementById("uptime").textContent = formatUptime(state.wifi.uptime_ms);
  document.getElementById("relayUpdated").textContent = `Updated ${formatTime(state.mqtt.lastMessageAt)}`;
  document.getElementById("lastMessage").textContent = `Last data ${formatTime(state.mqtt.lastMessageAt)}`;

  renderRelays();
  renderEvents();
}

function connectMqtt() {
  if (!window.mqtt) {
    addEvent("MQTT browser library failed to load");
    return;
  }

  mqttClient = mqtt.connect(MQTT_URL, {
    clientId: `pages-dashboard-${BOARD_ID}-${Math.random().toString(16).slice(2)}`,
    reconnectPeriod: 3000,
    clean: true,
    connectTimeout: 10000
  });

  mqttClient.on("connect", () => {
    state.mqtt.connected = true;
    addEvent(`MQTT connected: ${MQTT_URL}`);
    mqttClient.subscribe(`${BOARD_TOPIC}/#`);
    renderState();
  });

  mqttClient.on("reconnect", () => {
    addEvent("MQTT reconnecting...");
  });

  mqttClient.on("close", () => {
    state.mqtt.connected = false;
    renderState();
  });

  mqttClient.on("error", (error) => {
    addEvent(`MQTT error: ${error.message}`);
  });

  mqttClient.on("message", (topic, payloadBuffer) => {
    updateStateFromMqtt(topic, parsePayload(payloadBuffer));
    renderState();
  });
}

setInterval(() => {
  if (!state.mqtt.lastMessageAt) {
    return;
  }

  const ageMs = Date.now() - new Date(state.mqtt.lastMessageAt).getTime();
  if (ageMs > STALE_AFTER_MS && state.station.online) {
    state.station.online = false;
    addEvent("Station data is stale");
  }
}, 15000);

wifiManagerButton.addEventListener("click", sendWifiManagerCommand);
accessForm.addEventListener("submit", verifyAccess);

accessPin.focus();
