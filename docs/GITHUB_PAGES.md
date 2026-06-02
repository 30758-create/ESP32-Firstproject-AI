# GitHub Pages Dashboard

This static dashboard works without Render and without a local Node.js server. The browser connects to MQTT over secure WebSocket:

```text
wss://broker.hivemq.com:8884/mqtt
```

The ESP32 still connects to the same public broker over normal MQTT:

```text
broker.hivemq.com:1883
```

## Enable GitHub Pages

1. Push this branch to GitHub.
2. Open the GitHub repository.
3. Go to `Settings`.
4. Go to `Pages`.
5. Under `Build and deployment`, choose `Deploy from a branch`.
6. Branch: `06_Dashboard`.
7. Folder: `/docs`.
8. Save.

Your dashboard URL will look like:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/mission-control/
```

## Important

This is a static page. Anyone with the link and the MQTT topic can send commands because the current broker is public.

For real use, move to a private MQTT broker with username/password, such as HiveMQ Cloud, EMQX Cloud, or a self-hosted Mosquitto broker.

## Access PIN

The dashboard has a simple static PIN gate. The current PIN is:

```text
SmartCName6767
```

To change it, replace `ACCESS_PIN_SHA256` in `docs/app.js` with the SHA-256 hash of your new PIN. This is only a lightweight gate because the page source is public.
