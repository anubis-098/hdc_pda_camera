# PDA Camera Upload

Minimal web app for Zebra TC22 camera capture and immediate upload to local storage over LAN.

## What it does

- Opens the device camera from Chrome on Android
- Compresses the captured image in browser memory with Canvas before upload
- Shows a full-screen capture preview with `Confirm` and `Cancel` before upload
- Uploads a single JPEG via `multipart/form-data`
- Lets the operator choose `Inbound` or `Outbound` before capture
- Stores the file directly under the selected folder
- Keeps the UI minimal and camera-first for warehouse workflows

## Architecture

- Frontend: static HTML + vanilla JavaScript
- Backend: Fastify with streaming multipart handling
- Storage target: local folder, bind mount, or SMB-mounted path configured by environment variables
- HTTPS: optional in app, usually terminated by Nginx in LAN

## Project structure

- `frontend/`: HTML, CSS, and browser logic
- `backend/server.js`: API and static file server
- `Dockerfile`: container image for the app
- `docker-compose.yml`: local container runtime
- `nginx/nginx.conf.example`: reverse proxy TLS example
- `.env.example`: runtime configuration

## Quick start

### Node.js mode

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set:

```env
PORT=8090
STORAGE_ROOT=\\10.84.185.144\hdc\Scanner\PDA
INBOUND_DIR=Inbound
OUTBOUND_DIR=Outbound
STORAGE_USERNAME=
STORAGE_PASSWORD=
```

3. Start the app:

```bash
npm start
```

4. Open from a browser:

```text
http://SERVER_IP:8090
```

For camera access on Zebra Chrome, prefer:

- `https://pda-camera.local` through Nginx + trusted certificate
- Or Chrome dev flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` only for temporary development

### Docker mode

1. Create `.env` from `.env.example`

2. Set a storage path that exists on the Docker host and can be bind-mounted:

```env
PORT=8090
STORAGE_ROOT=/data/uploads
STORAGE_HOST_PATH=/mnt/pda-camera
INBOUND_DIR=Inbound
OUTBOUND_DIR=Outbound
```

`STORAGE_HOST_PATH` is the Ubuntu host path. If the final storage is an SMB share,
mount it on Ubuntu first, for example at `/mnt/pda-camera`, then use that path.
The app remains private on `127.0.0.1:8090`; Nginx should proxy to it.

3. Start with Docker Compose:

```bash
docker compose up --build -d
```

4. Open directly for an HTTP smoke test:

```text
http://127.0.0.1:8090
```

5. Stop:

```bash
docker compose down
```

## Upload behavior

- API endpoint: `POST /api/upload`
- Form fields:
  - `destination`: `Inbound` or `Outbound`
  - `image`: JPEG file

Saved file pattern:

```text
2026-08-26T10-15-20-123Z__Inbound.jpg
```

Files are grouped by date:

```text
<STORAGE_ROOT>\Inbound\2026-08-26\...
<STORAGE_ROOT>\Outbound\2026-08-26\...
```

## HTTPS in LAN

### Recommended production-like LAN setup

1. Create local CA and certificate with `mkcert`
2. Trust the CA on Zebra TC22 and operator PCs
3. Point local DNS or hosts entry to your server
4. Terminate TLS at Nginx
5. Proxy to Fastify on `http://127.0.0.1:8090`

Example hostname:

```text
pda-camera.local
```

### Temporary development option

If you must test before TLS is ready, use Chrome flag on the Zebra device:

```text
chrome://flags/#unsafely-treat-insecure-origin-as-secure
```

Add:

```text
http://10.84.x.x:8090
```

This is not suitable as the final deployment method.

## UI flow

- The camera view fills the screen like a mobile camera app
- Destination and status stay as floating overlays
- The top destination dropdown selects `Inbound` or `Outbound`
- After tapping capture, the live stream pauses into a preview screen
- Tap `Confirm` to upload or `Cancel` to discard and return to live camera

## Operational notes

- The backend process or container host must be able to write to the final storage path
- For Docker, prefer mounting the SMB share on the host first, then bind-mount that host path into the container
- Example Windows host approach: map `\\10.84.185.144\hdc\Scanner\PDA` to a local drive or mounted folder, then point the container volume to that host path
- Inside the container, keep `STORAGE_ROOT=/data/uploads`
- If the share requires credentials, the host OS or service account must already have access before the container starts
- In Node mode on Windows, optional `STORAGE_USERNAME` and `STORAGE_PASSWORD` can be used for UNC authentication before writes begin

## Next practical steps

1. Mount or map the final storage location on the Docker host
2. Start the app with `docker compose up --build -d`
3. Verify the server can write to the target storage path
4. Put Nginx + certificate in front of the app
5. Test camera permission on Zebra TC22 over Wi-Fi

For the current Docker setup, copy `nginx/nginx.conf.example` to the Ubuntu
Nginx site configuration. It terminates HTTPS on port `443` and proxies to
`http://127.0.0.1:8090`. Keep `HTTPS_ENABLED=false` in the app `.env` because
TLS is terminated by Nginx.
