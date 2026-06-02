const relayList = document.getElementById("relayList");
const wifiManagerButton = document.getElementById("wifiManagerButton");
const relays = [
  { id: 1, key: "relay1", name: "Relay 1" },
  { id: 2, key: "relay2", name: "Relay 2" },
  { id: 3, key: "relay3", name: "Relay 3" }
];

let latestState = null;
let dashboardPin = localStorage.getItem("dashboardPin") || "";

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

async function sendRelayCommand(relayId, command) {
  const buttons = relayList.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const response = await fetch(`/api/relay/${relayId}?command=${encodeURIComponent(command)}`, {
      method: "POST",
      headers: authHeaders()
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "Command failed");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function sendWifiManagerCommand() {
  const confirmed = confirm("Start WiFi Manager portal? ESP32 will clear saved WiFi and open AP: ESP32-Weather-Setup");
  if (!confirmed) {
    return;
  }

  wifiManagerButton.disabled = true;

  try {
    const response = await fetch("/api/wifi-manager", {
      method: "POST",
      headers: authHeaders()
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "WiFi Manager command failed");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    wifiManagerButton.disabled = false;
  }
}

function authHeaders() {
  if (!latestState?.authRequired) {
    return {};
  }

  if (!dashboardPin) {
    dashboardPin = prompt("Dashboard PIN") || "";
    localStorage.setItem("dashboardPin", dashboardPin);
  }

  return {
    "X-Dashboard-Pin": dashboardPin
  };
}

function renderRelays(state) {
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

function renderEvents(events) {
  const list = document.getElementById("events");
  const visibleEvents = events?.length ? events : [{ time: new Date().toISOString(), message: "Waiting for MQTT data" }];

  list.innerHTML = "";
  visibleEvents.slice(0, 8).forEach((event) => {
    const item = document.createElement("li");
    item.textContent = `${formatTime(event.time)} - ${event.message}`;
    list.appendChild(item);
  });
}

function renderState(state) {
  latestState = state;
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

  renderRelays(state);
  renderEvents(state.events);
}

async function loadInitialState() {
  const response = await fetch("/api/state");
  renderState(await response.json());
}

function connectEvents() {
  const events = new EventSource("/api/events");

  events.addEventListener("state", (event) => {
    renderState(JSON.parse(event.data));
  });

  events.addEventListener("error", () => {
    if (latestState) {
      setStatus("mqttStatus", "Dashboard reconnecting", false);
    }
  });
}

loadInitialState().then(connectEvents).catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>${error.message}</h1></section></main>`;
});

wifiManagerButton.addEventListener("click", sendWifiManagerCommand);
