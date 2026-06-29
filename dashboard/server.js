const http = require("http");
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");

const PORT = Number(process.env.PORT || 3000);
const MQTT_URL = process.env.MQTT_URL || "mqtt://broker.hivemq.com:1883";
const BOARD_ID = process.env.BOARD_ID || "esp32-weather-smartyyy-8f42";
const MQTT_BASE_TOPIC = process.env.MQTT_BASE_TOPIC || "esp32/weather";
const BOARD_TOPIC = `${MQTT_BASE_TOPIC}/${BOARD_ID}`;
const PUBLIC_DIR = path.join(__dirname, "public");

const state = {
  boardId: BOARD_ID,
  mqtt: {
    url: MQTT_URL,
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

const sseClients = new Set();

function addEvent(message) {
  state.events.unshift({
    time: new Date().toISOString(),
    message
  });
  state.events = state.events.slice(0, 20);
}

function sendSse(client, type, payload) {
  client.write(`event: ${type}\n`);
  client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastState() {
  for (const client of sseClients) {
    sendSse(client, "state", state);
  }
}

function parseJsonPayload(payload) {
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

const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: `dashboard-${BOARD_ID}-${Math.random().toString(16).slice(2)}`,
  reconnectPeriod: 3000
});

mqttClient.on("connect", () => {
  state.mqtt.connected = true;
  addEvent(`MQTT connected: ${MQTT_URL}`);
  mqttClient.subscribe(`${BOARD_TOPIC}/#`);
  broadcastState();
});

mqttClient.on("reconnect", () => {
  addEvent("MQTT reconnecting...");
  broadcastState();
});

mqttClient.on("close", () => {
  state.mqtt.connected = false;
  broadcastState();
});

mqttClient.on("error", (error) => {
  addEvent(`MQTT error: ${error.message}`);
  broadcastState();
});

mqttClient.on("message", (topic, payloadBuffer) => {
  const payload = parseJsonPayload(payloadBuffer);
  updateStateFromMqtt(topic, payload);
  broadcastState();
});

function publishRelayCommand(relay, command, response) {
  const relayNumber = Number(relay);
  const normalizedCommand = String(command || "").trim().toUpperCase();
  const allowedRelays = [1, 2, 3];
  const allowedCommands = ["ON", "OFF", "TOGGLE"];

  if (!allowedRelays.includes(relayNumber) || !allowedCommands.includes(normalizedCommand)) {
    sendJson(response, 400, { ok: false, error: "Invalid relay or command." });
    return;
  }

  const topic = `${BOARD_TOPIC}/control/relay/${relayNumber}/set`;
  mqttClient.publish(topic, normalizedCommand, { qos: 0 }, (error) => {
    if (error) {
      sendJson(response, 500, { ok: false, error: error.message });
      return;
    }

    addEvent(`Relay ${relayNumber} command: ${normalizedCommand}`);
    broadcastState();
    sendJson(response, 200, { ok: true, topic, command: normalizedCommand });
  });
}

function publishWifiManagerCommand(response) {
  const topic = `${BOARD_TOPIC}/control/wifi/manager`;
  const command = "START";

  mqttClient.publish(topic, command, { qos: 0 }, (error) => {
    if (error) {
      sendJson(response, 500, { ok: false, error: error.message });
      return;
    }

    addEvent("WiFi Manager command sent");
    broadcastState();
    sendJson(response, 200, { ok: true, topic, command });
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
}

function serveStatic(request, response) {
  const urlPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const pageAliases = new Set([
    "/",
    "/mission-control",
    "/weather-station",
    "/dashboard"
  ]);
  const safePath = pageAliases.has(urlPath) ? "index.html" : urlPath.slice(1);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };

    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, state);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    response.write("\n");
    sseClients.add(response);
    sendSse(response, "state", state);

    request.on("close", () => {
      sseClients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/relay/")) {
    const parts = url.pathname.split("/");
    publishRelayCommand(parts[3], url.searchParams.get("command"), response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/wifi-manager") {
    publishWifiManagerCommand(response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`MQTT: ${MQTT_URL}`);
  console.log(`Board topic: ${BOARD_TOPIC}`);
});
