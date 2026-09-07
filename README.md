# PDA Camera Upload

Minimal web app for Zebra TC22 camera capture and immediate upload to local storage over LAN.

## What it does

- Opens the device camera from Chrome on Android
- Compresses the captured image in browser memory with Canvas before upload
- Shows a full-screen capture preview with `Confirm` and `Cancel` before upload
- Uploads a single JPEG via `multipart/form-data`
- Lets the operator choose `Inbound`, `Return`, `Outbound`, or `Other` before capture
- Stores the file directly under the selected folder
- Keeps the UI minimal and camera-first for warehouse workflows

## Image settings

`Saved image size` controls the exact dimensions of both the preview JPEG and
the uploaded file. Changing this setting does not restart the camera.

| Ratio | High | Medium | Small |
| --- | --- | --- | --- |
| 9:16 | 1080 x 1920 | 720 x 1280 | 576 x 1024 |
| 3:4 | 1080 x 1440 | 960 x 1280 | 768 x 1024 |
| 4:3 | 1440 x 1080 | 1280 x 960 | 1024 x 768 |
| 1:1 | 1080 x 1080 | 960 x 960 | 720 x 720 |

Image quality is separate: High clarity (default), Balanced, or Smaller file.
There is no fixed 200-300 KB guarantee: detailed photos need more bytes.
Ratio, size, quality, language and destination are remembered on the device.
Changing ratio preserves the corresponding size tier.

The app requests a 2560 x 1920 live stream as a preference. The browser chooses
the actual supported stream. It attempts a native still photo using the maximum
photo width exposed by the camera, then resizes to the selected output dimensions.
If native capture fails, times out, or returns a different aspect/orientation,
the already captured video frame is used. Preview shows the source type and size,
and warns when enlargement was necessary. Enlargement cannot restore missing detail.

The crop guide has the selected aspect ratio, including 9:16 when the display
does not have that exact shape. It disappears when reviewing the final JPEG.
Native photos use the normalized crop edges from the live frame. Some hardware
uses a different field of view for stills despite matching aspect ratios; verify
framing, orientation and zoom on the actual TC22. API capability exposure varies
by camera/browser; see the [Image Capture specification](https://www.w3.org/TR/image-capture/).

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
RETURN_DIR=Return
OUTBOUND_DIR=Outbound
OTHER_DIR=Other
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
RETURN_DIR=Return
OUTBOUND_DIR=Outbound
OTHER_DIR=Other
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
  - `destination`: `Inbound`, `Return`, `Outbound`, or `Other`
  - `image`: JPEG file

Saved file pattern:

```text
2026-08-26T10-15-20-123Z__Return__<unique-id>.jpg
```

Files are stored directly in the selected folder. Dates are in the filenames:

```text
<STORAGE_ROOT>\Inbound\...jpg
<STORAGE_ROOT>\Return\...jpg
<STORAGE_ROOT>\Outbound\...jpg
<STORAGE_ROOT>\Other\...jpg
```

Both multipart field orders are accepted. A destination is required; `ROOT` is
not accepted. Uploads must be JPEG and pass basic start/end-marker and size checks
(this is not a full image decoder). Files are streamed to temporary `.part` files
and renamed only after the complete request is validated. Failed requests clean
up temporary files. A process crash can leave hidden `.part` files for maintenance;
these are never listed in Gallery. If an upload loses its response, check Gallery
before retrying because the server may already have saved the image.

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
- The top destination dropdown selects `Inbound`, `Return`, `Outbound`, or `Other`
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

## Verification

Use Node.js 24 (also used by Docker) and run `npm ci` then `npm test`.
`npm run test:browser` uses local Chrome with a simulated camera and an isolated
test server on 127.0.0.1:18091. Set `PDA_TEST_BROWSER=msedge` to use Edge instead.
Tests use temporary storage, never the configured File Server. Browser tests cover
every output size, byte-for-byte upload, native fallback, rapid zoom, saved settings,
Thai notices and viewport bounds. Real TC22 sensor behavior, SOTI trust deployment
and Ubuntu SMB permissions still need an on-device deployment check.

After updating code on Ubuntu, run `docker compose up -d --build` and reload the
page. Compose keeps the container on 8090; `PORT` selects the host-side loopback
port. Match Nginx's upstream to that host port. Existing public HTTPS ports and
certificates are not changed by this update. The app is designed for the trusted
warehouse LAN; gallery/delete APIs do not implement user login.
