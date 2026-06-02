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
const EARTH_MODEL_URL = "/assets/Earth_1_12756.glb";
const relays = [
  { id: 1, key: "relay1", name: "Relay 1" },
  { id: 2, key: "relay2", name: "Relay 2" },
  { id: 3, key: "relay3", name: "Relay 3" }
];

let latestState = null;
let dashboardPin = localStorage.getItem("dashboardPin") || "";
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
let globeFallbackShell = null;

const timezoneChoices = [
  { value: "Asia/Bangkok", label: "Bangkok", region: "Thailand", lat: 13.75, lon: 100.5 },
  { value: "Asia/Tokyo", label: "Tokyo", region: "Japan", lat: 35.68, lon: 139.76 },
  { value: "Asia/Singapore", label: "Singapore", region: "Singapore", lat: 1.35, lon: 103.82 },
  { value: "Europe/London", label: "London", region: "United Kingdom", lat: 51.5, lon: -0.12 },
  { value: "America/New_York", label: "New York", region: "United States", lat: 40.71, lon: -74.01 },
  { value: "UTC", label: "UTC", region: "Coordinated Time", lat: 0, lon: 0 }
];

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

function fitModelToGlobe(model, radius) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = (radius * 2) / maxSize;

  model.position.sub(center);
  model.scale.setScalar(scale);
}

function loadEarthModel() {
  if (!THREE.GLTFLoader) {
    return;
  }

  const loader = new THREE.GLTFLoader();
  loader.load(
    EARTH_MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      fitModelToGlobe(model, 1.65);
      model.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = true;
          if (child.material) {
            child.material.roughness = Math.min(child.material.roughness ?? 0.8, 0.82);
            child.material.metalness = 0.02;
          }
        }
      });
      globeGroup.add(model);
      if (globeFallbackShell) {
        globeFallbackShell.visible = false;
      }
    },
    undefined,
    (error) => {
      console.warn(`Earth model failed: ${error.message}`);
    }
  );
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

  globeScene = new THREE.Scene();
  globeCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  globeCamera.position.set(0, 0, 5.2);

  globeGroup = new THREE.Group();
  globeScene.add(globeGroup);

  globeFallbackShell = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0x0c2b3f,
      transparent: true,
      opacity: 0.18,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x0b86a8,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  globeGroup.add(globeFallbackShell);

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
  loadEarthModel();

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

  globeScene.add(new THREE.AmbientLight(0x88ccff, 1.1));
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
timezoneSelect.addEventListener("change", saveTimezone);
timezoneOpenButton.addEventListener("click", openGlobe);
globeCloseButton.addEventListener("click", closeGlobe);

setInterval(updateLiveClock, 1000);
loadTimezone();
updateLiveClock();
