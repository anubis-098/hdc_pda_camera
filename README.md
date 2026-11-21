# PDA Camera Upload

Minimal web app for Zebra TC22 camera capture and immediate upload to local storage over LAN.

## What it does

- Opens the device camera from Chrome on Android
- Compresses the captured image in browser memory with Canvas before upload
- Shows a full-screen capture preview with `Confirm` and `Cancel` before upload
- Uploads a single JPEG via `multipart/form-data`
- Defaults to `Other` and lets the operator tap `+` to create and select a named folder
- Stores the file directly under the selected folder
- Keeps the UI minimal and camera-first for warehouse workflows

## Image settings

`Saved image size` lets you choose a longest edge of 1920, 1280, or 1024 pixels.
The other edge follows the shape of the visible camera preview at capture
time, rounded to a whole pixel. The dimensions shown in Settings update when
the preview size changes. Changing image size does not restart the camera.

JPEG quality is separate: Balanced (default), High clarity, or Smaller file.
There is no fixed 200-300 KB guarantee: detailed photos need more bytes.
Size, quality, language and destination are remembered on the device.

The app requests a 2560 x 1920 live stream as a preference. The browser chooses
the actual supported stream. It attempts a native still photo using the maximum
photo width exposed by the camera, then resizes to the selected output dimensions.
If native capture fails, times out, or returns a different aspect/orientation,
the already captured video frame is used. The confirmation screen only shows the
saved image dimensions and the selected destination.

The app saves the area visible in the live preview and scales it uniformly to
preserve object proportions.
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
STORAGE_ROOT=\\CJITADMINSERVER\Scanner\PDA-Camera
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
COMPOSE_HTTP_PORT=8083
STORAGE_HOST_PATH=/mnt/pda-camera
INBOUND_DIR=Inbound
RETURN_DIR=Return
OUTBOUND_DIR=Outbound
OTHER_DIR=Other
```

`STORAGE_HOST_PATH` is a directory accessible to the Docker host. If the final
storage is an SMB share, mount it on the Docker host first and set this variable
to the mounted directory. For a local smoke test, leave it unset and create
an `uploads` directory in the project if needed. The app listens on `127.0.0.1:8083` on the
host; Nginx should proxy to that address.

3. Start with Docker Compose:

```bash
docker compose up --build -d
```

4. Open directly for an HTTP smoke test:

```text
http://127.0.0.1:8083
```

5. Stop:

```bash
docker compose down
```

## Upload behavior

- API endpoint: `POST /api/upload`
- Form fields:
  - `destination`: A folder returned by `GET /api/folders`
  - `image`: JPEG file

Saved file pattern:

```text
2026-08-26T10-15-20-123Z__Other__<unique-id>.jpg
```

Files are stored directly in the selected folder. Dates are in the filenames:

```text
<STORAGE_ROOT>\Other\...jpg
<STORAGE_ROOT>\<custom folder>\...jpg
```

`PUT /api/folders/Other` creates `Other` if needed. `POST /api/folders` with a
JSON `name` creates a new folder. User-created folders support Thai names and
spaces. Legacy Inbound, Return and Outbound folders are hidden from the app
while their files remain on disk.

Both multipart field orders are accepted. A destination is required; `ROOT` is
not accepted. Uploads must be JPEG and pass basic start/end-marker and size checks
(this is not a full image decoder). Files are streamed to temporary `.part` files
and renamed only after the complete request is validated. Failed requests clean
up temporary files. A process crash can leave hidden `.part` files for maintenance;
these are never listed in Gallery. If an upload loses its response, check Gallery
before retrying because the server may already have saved the image.

## HTTPS in LAN

### Docker Compose with Nginx

Set these values in the server's `.env`, using the actual DNS name on the
server certificate. Use forward slashes for the Windows bind-mount path.

```env
PDA_HTTPS_HOSTNAME=pda-camera.local
PDA_HTTPS_BIND_ADDRESS=0.0.0.0
PDA_CERT_DIR=D:/HDC-Certificates
HTTPS_ENABLED=false
```

Save the following PEM files in `PDA_CERT_DIR`:

- `pda-camera.pem` contains the server certificate followed by any intermediate
  certificates. Its Subject Alternative Name must include the hostname used
  by the PDA.
- `pda-camera-key.pem` contains the matching server private key. Keep it out of Git.

`D:\HDC-Certificates\hdc-root-ca.cer` is the root CA certificate to trust on
the Zebra TC22 and operator PCs. Obtain the server certificate and key from
your CA administrator if you only have the root CA certificate.

Point DNS for `PDA_HTTPS_HOSTNAME` to the Windows server. Start Nginx and the app
with `docker compose --profile https up -d --build`. Nginx redirects port 80
to HTTPS on port 443 and proxies to the app over the Compose network. Verify
the deployment at `https://<PDA_HTTPS_HOSTNAME>/api/health` from a client that
trusts the CA. For a local-only deployment, set `PDA_HTTPS_BIND_ADDRESS=127.0.0.1`.

If Nginx already runs on the server, use `nginx/nginx.conf.example` as the
site configuration instead of starting the Compose HTTPS profile. Set the
hostname and paths to match the server certificate and key. Its upstream is
`http://127.0.0.1:8083` for Compose or `http://127.0.0.1:8090` for Node.js directly.

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
- Use `Other` or tap `+` to create and automatically select a custom folder.
- After tapping capture, the live stream pauses into a preview screen
- Tap `Confirm` to upload or `Cancel` to discard and return to live camera

## Operational notes

- The backend process or container host must be able to write to the final storage path
- For Docker, prefer mounting the SMB share on the host first, then bind-mount that host path into the container
- When running Node.js on Windows, use the UNC path `\\CJITADMINSERVER\Scanner\PDA-Camera` directly. The account running Node.js needs write access through both SMB share and NTFS permissions.
- Inside the container, keep `STORAGE_ROOT=/data/uploads`
- If the share requires credentials, the host OS or service account must already have access before the container starts
- In Node mode on Windows, optional `STORAGE_USERNAME` and `STORAGE_PASSWORD` can be used for UNC authentication before writes begin

## Next practical steps

1. Mount or map the final storage location on the Docker host
2. Start the app with `docker compose up --build -d`
3. Verify the server can write to the target storage path
4. Put Nginx + certificate in front of the app
5. Test camera permission on Zebra TC22 over Wi-Fi

## Verification

Use Node.js 24 (also used by Docker) and run `npm ci` then `npm test`.
`npm run test:browser` uses local Chrome with a simulated camera and an isolated
test server on 127.0.0.1:18091. Set `PDA_TEST_BROWSER=msedge` to use Edge instead.
Tests use temporary storage, never the configured File Server. Browser tests cover
every output size, byte-for-byte upload, native fallback, rapid zoom, saved settings,
Thai notices and viewport bounds. Real TC22 sensor behavior, SOTI trust deployment
and Ubuntu SMB permissions still need an on-device deployment check.

After updating code, rebuild with the same Compose profile used for deployment.
`COMPOSE_HTTP_PORT` selects the direct host-side loopback port. The app is
designed for the trusted warehouse LAN; gallery/delete APIs do not implement
user login.
