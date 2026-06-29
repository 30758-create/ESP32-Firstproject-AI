const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const BOARD_ID = "esp32-weather-smartyyy-8f42";
const MQTT_BASE_TOPIC = "esp32/weather";
const BOARD_TOPIC = `${MQTT_BASE_TOPIC}/${BOARD_ID}`;
const STALE_AFTER_MS = 90000;
const EARTH_TEXTURE_URL = "assets/earth_atmos_2048.jpg";

const relayList = document.getElementById("relayList");
const wifiManagerButton = document.getElementById("wifiManagerButton");
const liveClock = document.getElementById("liveClock");
const timezoneSelect = document.getElementById("timezoneSelect");
const timezoneControl = document.querySelector(".timezone-control");
const timezoneOpenButton = document.getElementById("timezoneOpenButton");
const timezoneCurrent = document.getElementById("timezoneCurrent");
const globeOverlay = document.getElementById("globeOverlay");
const globeCanvas = document.getElementById("globeCanvas");
const globeCloseButton = document.getElementById("globeCloseButton");
const timezoneOptions = document.getElementById("timezoneOptions");
const revealIpButton = document.getElementById("revealIpButton");
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
let ipVisible = false;
let globeReady = false;
let globeRenderer = null;
let globeScene = null;
let globeCamera = null;
let globeGroup = null;
let globeAnimation = 0;
let globeLastFrameTime = 0;
let globeDragging = false;
let globeLastX = 0;
let globeLastY = 0;
let globeVelocityX = 0;
let globeVelocityY = 0;
let globeRaycaster = null;
let globePointer = null;
let globeMarkers = [];
let globeDragDistance = 0;
let globeShell = null;

const timezoneChoices = [
  { value: "Asia/Bangkok", label: "Bangkok", region: "Thailand", lat: 13.75, lon: 100.5 },
  { value: "Asia/Tokyo", label: "Tokyo", region: "Japan", lat: 35.68, lon: 139.76 },
  { value: "Asia/Singapore", label: "Singapore", region: "Singapore", lat: 1.35, lon: 103.82 },
  { value: "Europe/London", label: "London", region: "United Kingdom", lat: 51.5, lon: -0.12 },
  { value: "America/New_York", label: "New York", region: "United States", lat: 40.71, lon: -74.01 },
  { value: "UTC", label: "UTC", region: "Coordinated Time", lat: 0, lon: 0 }
];

function startApp() {
  renderState();
  connectMqtt();
}

function toggleIpAddress() {
  ipVisible = !ipVisible;
  renderState();
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

function updateLiveClock() {
  liveClock.textContent = new Date().toLocaleTimeString("th-TH", {
    timeZone: timezoneSelect.value,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function selectedTimezoneLabel() {
  return timezoneChoices.find((item) => item.value === timezoneSelect.value)?.label || timezoneSelect.value;
}

function loadTimezone() {
  timezoneSelect.value = localStorage.getItem("dashboardTimezone") || "Asia/Bangkok";
  timezoneCurrent.textContent = selectedTimezoneLabel();
}

function saveTimezone(value = timezoneSelect.value) {
  timezoneSelect.value = value;
  localStorage.setItem("dashboardTimezone", timezoneSelect.value);
  timezoneCurrent.textContent = selectedTimezoneLabel();
  timezoneControl.classList.remove("pop");
  void timezoneControl.offsetWidth;
  timezoneControl.classList.add("pop");
  renderTimezoneOptions();
  updateLiveClock();
}

function renderTimezoneOptions() {
  timezoneOptions.innerHTML = "";

  for (const choice of timezoneChoices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timezone-option ${choice.value === timezoneSelect.value ? "active" : ""}`;
    button.innerHTML = `<span>${choice.label}</span><small>${choice.region}</small>`;
    button.addEventListener("click", () => {
      saveTimezone(choice.value);
      closeGlobe();
    });
    timezoneOptions.appendChild(button);
  }
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function addOrbitRing(radius, tiltX, tiltY, color, opacity) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.006, 8, 128),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  ring.rotation.x = tiltX;
  ring.rotation.y = tiltY;
  globeGroup.add(ring);
}

function addDataArc(fromChoice, toChoice, color) {
  const from = latLonToVector3(fromChoice.lat, fromChoice.lon, 1.74);
  const to = latLonToVector3(toChoice.lat, toChoice.lon, 1.74);
  const mid = from.clone().add(to).normalize().multiplyScalar(2.18);
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(42));
  const arc = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.46 })
  );
  globeGroup.add(arc);
}

function addStarField() {
  const positions = [];
  for (let i = 0; i < 420; i++) {
    const radius = 3.2 + Math.random() * 1.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  globeScene.add(new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0x8be9ff, size: 0.012, transparent: true, opacity: 0.42 })
  ));
}

function initGlobe() {
  if (globeReady || !window.THREE) {
    return;
  }

  globeRenderer = new THREE.WebGLRenderer({ canvas: globeCanvas, antialias: true, alpha: true });
  globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  if (THREE.SRGBColorSpace) {
    globeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (THREE.sRGBEncoding) {
    globeRenderer.outputEncoding = THREE.sRGBEncoding;
  }

  globeScene = new THREE.Scene();
  globeCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  globeCamera.position.set(0, 0, 5.2);

  globeGroup = new THREE.Group();
  globeScene.add(globeGroup);

  addStarField();

  const textureLoader = new THREE.TextureLoader();
  const earthTexture = textureLoader.load(EARTH_TEXTURE_URL);
  if (THREE.sRGBEncoding) {
    earthTexture.encoding = THREE.sRGBEncoding;
  }

  globeShell = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 72, 48),
    new THREE.MeshStandardMaterial({
      map: earthTexture,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      emissive: 0x061a2b,
      emissiveIntensity: 0.16
    })
  );
  globeGroup.add(globeShell);

  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.67, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x35d7ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  globeGroup.add(rim);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.82, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x35d7ff, transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false })
  );
  globeGroup.add(atmosphere);

  addOrbitRing(1.96, Math.PI / 2.5, 0.18, 0x35d7ff, 0.24);
  addOrbitRing(2.08, Math.PI / 2.15, -0.62, 0xa78bfa, 0.18);
  addOrbitRing(1.78, Math.PI / 1.92, 0.84, 0x1fd39d, 0.16);
  addDataArc(timezoneChoices[0], timezoneChoices[3], 0x35d7ff);
  addDataArc(timezoneChoices[1], timezoneChoices[4], 0xa78bfa);
  addDataArc(timezoneChoices[2], timezoneChoices[5], 0x1fd39d);

  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x1fd39d });
  globeMarkers = [];
  for (const choice of timezoneChoices) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 20), markerMaterial);
    marker.position.copy(latLonToVector3(choice.lat, choice.lon, 1.72));
    marker.userData.timezone = choice.value;
    globeGroup.add(marker);
    globeMarkers.push(marker);
  }

  globeRaycaster = new THREE.Raycaster();
  globePointer = new THREE.Vector2();

  globeScene.add(new THREE.AmbientLight(0x88ccff, 1.28));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(3, 2, 4);
  globeScene.add(keyLight);
  const rimLight = new THREE.PointLight(0x9f7bff, 8, 8);
  rimLight.position.set(-2.4, 1.2, 2.3);
  globeScene.add(rimLight);

  globeCanvas.addEventListener("pointerdown", (event) => {
    globeDragging = true;
    globeLastX = event.clientX;
    globeLastY = event.clientY;
    globeDragDistance = 0;
  });

  globeCanvas.addEventListener("pointerup", (event) => {
    globeDragging = false;
    pickTimezoneMarker(event);
  });

  window.addEventListener("pointermove", (event) => {
    if (!globeDragging) {
      return;
    }

    const dx = event.clientX - globeLastX;
    const dy = event.clientY - globeLastY;
    globeDragDistance += Math.abs(dx) + Math.abs(dy);
    globeVelocityY = dx * 0.0025;
    globeVelocityX = dy * 0.0018;
    globeGroup.rotation.y += dx * 0.0055;
    globeGroup.rotation.x += dy * 0.004;
    globeGroup.rotation.x = Math.max(-0.9, Math.min(0.9, globeGroup.rotation.x));
    globeLastX = event.clientX;
    globeLastY = event.clientY;
  });

  window.addEventListener("pointerup", () => {
    globeDragging = false;
  });

  window.addEventListener("resize", resizeGlobe);
  globeReady = true;
}

function pickTimezoneMarker(event) {
  if (!globeRaycaster || !globePointer || !globeCamera || !globeMarkers.length) {
    return;
  }
  if (globeDragDistance > 12) {
    return;
  }

  const rect = globeCanvas.getBoundingClientRect();
  globePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  globePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  globeRaycaster.setFromCamera(globePointer, globeCamera);

  const hits = globeRaycaster.intersectObjects(globeMarkers, false);
  if (!hits.length) {
    return;
  }

  saveTimezone(hits[0].object.userData.timezone);
  closeGlobe();
}

function resizeGlobe() {
  if (!globeRenderer || !globeCamera) {
    return;
  }

  const width = globeCanvas.clientWidth || window.innerWidth;
  const height = globeCanvas.clientHeight || window.innerHeight;
  globeRenderer.setSize(width, height, false);
  globeCamera.aspect = width / height;
  globeCamera.updateProjectionMatrix();
}

function animateGlobe(now = 0) {
  if (globeOverlay.classList.contains("hidden")) {
    return;
  }

  globeAnimation = requestAnimationFrame(animateGlobe);
  const delta = globeLastFrameTime ? Math.min(32, now - globeLastFrameTime) / 16.67 : 1;
  globeLastFrameTime = now;

  if (globeGroup) {
    if (!globeDragging) {
      globeVelocityY += 0.00012 * delta;
    }
    globeGroup.rotation.y += globeVelocityY * delta;
    globeGroup.rotation.x += globeVelocityX * delta;
    globeGroup.rotation.x = Math.max(-0.9, Math.min(0.9, globeGroup.rotation.x));
    globeVelocityY *= Math.pow(0.93, delta);
    globeVelocityX *= Math.pow(0.9, delta);
  }
  globeRenderer.render(globeScene, globeCamera);
}

function openGlobe() {
  globeOverlay.classList.remove("hidden");
  renderTimezoneOptions();
  initGlobe();
  resizeGlobe();
  cancelAnimationFrame(globeAnimation);
  globeLastFrameTime = 0;
  animateGlobe();
}

function closeGlobe() {
  globeOverlay.classList.add("hidden");
  cancelAnimationFrame(globeAnimation);
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
  const receivedAt = new Date().toISOString();
  state.mqtt.lastMessageAt = receivedAt;

  if (topic === `${BOARD_TOPIC}/telemetry/weather`) {
    state.weather = payload || {};
  } else if (topic === `${BOARD_TOPIC}/telemetry/air`) {
    state.air = payload || {};
  } else if (topic === `${BOARD_TOPIC}/telemetry/status`) {
    state.wifi = payload || {};
    state.station.online = true;
    state.station.lastStatusAt = receivedAt;
  } else if (topic === `${BOARD_TOPIC}/telemetry/relay`) {
    state.relay = {
      relay1: payload?.relay1 || state.relay.relay1,
      relay2: payload?.relay2 || state.relay.relay2,
      relay3: payload?.relay3 || state.relay.relay3
    };
  } else if (topic === `${BOARD_TOPIC}/status`) {
    state.station.online = payload?.status === "online";
    state.station.lastStatusAt = receivedAt;
  }
}

function publish(topic, message) {
  if (!mqttClient?.connected) {
    alert("MQTT is not connected yet.");
    return false;
  }

  mqttClient.publish(topic, message);
  return true;
}

function sendRelayCommand(relayId, command) {
  const topic = `${BOARD_TOPIC}/control/relay/${relayId}/set`;
  if (!publish(topic, command)) {
    return;
  }

  const relay = relays.find((item) => item.id === relayId);
  if (relay) {
    const currentValue = state.relay?.[relay.key] || "OFF";
    state.relay[relay.key] = command === "TOGGLE"
      ? (currentValue === "ON" ? "OFF" : "ON")
      : command;
    renderState();
  }

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
    const isOn = value === "ON";
    const nextCommand = isOn ? "OFF" : "ON";
    const row = document.createElement("div");
    row.className = `relay-row ${isOn ? "relay-row-on" : ""}`;
    row.innerHTML = `
      <div class="relay-name">
        <span class="relay-dot"></span>
        <span>${relay.name}</span>
        <span class="relay-state ${isOn ? "on" : ""}">${isOn ? "เปิดอยู่" : "ปิดอยู่"}</span>
      </div>
      <button class="btn-relay-switch ${isOn ? "is-on" : ""}" data-command="${nextCommand}">
        ${isOn ? "ปิด" : "เปิด"}
      </button>
    `;

    row.querySelector("button").addEventListener("click", (event) => {
      sendRelayCommand(relay.id, event.currentTarget.dataset.command);
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
  document.getElementById("ipAddress").textContent = ipVisible ? formatValue(state.wifi.ip) : "Hidden";
  revealIpButton.textContent = ipVisible ? "Hide" : "Show";
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
  if (!state.station.lastStatusAt) {
    return;
  }

  const ageMs = Date.now() - new Date(state.station.lastStatusAt).getTime();
  if (ageMs > STALE_AFTER_MS && state.station.online) {
    state.station.online = false;
    addEvent("Station data is stale");
  }
}, 15000);

setInterval(updateLiveClock, 1000);
loadTimezone();
updateLiveClock();

wifiManagerButton.addEventListener("click", sendWifiManagerCommand);
revealIpButton.addEventListener("click", toggleIpAddress);
timezoneSelect.addEventListener("change", saveTimezone);
timezoneOpenButton.addEventListener("click", openGlobe);
globeCloseButton.addEventListener("click", closeGlobe);
startApp();
