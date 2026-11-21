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
- `nginx/nginx.conf`: HTTPS reverse proxy used by Docker Compose
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

### Docker Compose on Windows 11 Pro

1. Install Docker Desktop and use Linux containers. Copy `.env.example` to
   `.env` for a fresh installation. Keep the existing server `.env` when upgrading.

2. On the Windows server hosting the `Scanner` share, run this from PowerShell
   with an account that can run Docker and read `Get-SmbShare`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\deploy\windows\start.ps1
```

The script finds the physical path of the local `Scanner` share, checks that
its `PDA-Camera` subfolder exists, and passes the path to Compose for this run.
It overrides older storage paths from `.env` without editing the file. If you
know the physical directory, pass it directly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\deploy\windows\start.ps1 -StoragePath 'D:\Shares\Scanner\PDA-Camera'
```

To run plain Compose commands, set `STORAGE_HOST_PATH` in `.env` to the path
printed by the script, using forward slashes. Docker bind-mounts that folder at
`/data/uploads` inside the container.

```powershell
docker compose up -d --build --wait
docker compose ps
```

3. Check `https://10.84.185.1:8083` from a device that trusts the CA.
   See [HTTPS in LAN](#https-in-lan) for certificate and network settings.

## Upload behavior

- API endpoint: `POST /api/upload`
- Form fields:
  - `destination`: A folder returned by `GET /api/folders`
  - `remark`: Optional text from the Remark field, up to 60 characters
  - `capturedAt`: Capture time as an ISO UTC timestamp. If omitted, the server uses the upload time.
  - `image`: JPEG file

The app uses the Remark value when the shutter is pressed. Filenames use the
capture date in Bangkok time as `DDMMYYYY_Remark.jpg`. Thai text and spaces
are supported. Unsupported characters are replaced with underscores. A blank
remark uses the date alone. Duplicate names get a numeric suffix.

```text
26082026_Receiving 1.jpg
26082026_Receiving 1_2.jpg
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

Multipart fields can be supplied in any order. A destination is required; `ROOT` is
not accepted. Uploads must be JPEG and pass basic start/end-marker and size checks
(this is not a full image decoder). Files are streamed to temporary `.part` files
and renamed only after the complete request is validated. Failed requests clean
up temporary files. A process crash can leave hidden `.part` files for maintenance;
these are never listed in Gallery. If an upload loses its response, check Gallery
before retrying because the server may already have saved the image.

## HTTPS in LAN

### Docker Compose with Nginx

Like the other HDC apps on ports 8080–8082, Docker Compose publishes the host
port directly to Nginx's HTTPS listener. Set these values in the server's
`.env`. Use forward slashes for the Windows bind-mount path.

```env
BIND_ADDRESS=0.0.0.0
COMPOSE_HTTP_PORT=8083
HDC_TLS_DIRECTORY=D:/HDC-Certificates
```

Use the same PEM files in `HDC_TLS_DIRECTORY` as the other HDC apps:

- `hdc-server.crt` contains the server certificate followed by any intermediate
  certificates. Its IP Subject Alternative Name must include `10.84.185.1`
  when users connect to that address.
- `hdc-server.key` contains the matching server private key. Keep it out of Git.

`D:\HDC-Certificates\hdc-root-ca.cer` is the root CA certificate to trust on
the Zebra TC22 and operator PCs. Obtain the server certificate and key from
your CA administrator if you only have the root CA certificate.

Run `docker compose up -d --build --wait`. Nginx maps host port `8083` to
container port `443` and proxies to `pda-camera:8090` over the Compose network.
Verify `https://10.84.185.1:8083/api/health` from a client that trusts the CA.
For local access only, use `BIND_ADDRESS=127.0.0.1` and a certificate valid for
the local address.

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

1. Identify the physical directory behind the local Windows share
2. Start the app with `.\deploy\windows\start.ps1`
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
and Windows server storage permissions still need an on-device deployment check.

After updating code, run `docker compose up -d --build --wait`.
`COMPOSE_HTTP_PORT` selects the host port for Nginx HTTPS. The app is
designed for the trusted warehouse LAN; gallery/delete APIs do not implement
user login.
