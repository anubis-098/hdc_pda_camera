'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const cors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');

const execFileAsync = promisify(execFile);

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));

const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8090),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  storageRoot: process.env.STORAGE_ROOT || path.join(process.cwd(), 'uploads'),
  inboundDir: process.env.INBOUND_DIR || 'Inbound',
  outboundDir: process.env.OUTBOUND_DIR || 'Outbound',
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024,
  httpsEnabled: String(process.env.HTTPS_ENABLED || 'false').toLowerCase() === 'true',
  httpsKeyPath: process.env.HTTPS_KEY_PATH || '',
  httpsCertPath: process.env.HTTPS_CERT_PATH || '',
  storageUsername: process.env.STORAGE_USERNAME || '',
  storagePassword: process.env.STORAGE_PASSWORD || ''
};

function safeSegment(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('..') || /[\\/]/.test(trimmed)) {
    return null;
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveTargetBase(destination) {
  if (!destination || destination === 'ROOT') {
    return config.storageRoot;
  }

  if (destination === 'Inbound') {
    return path.join(config.storageRoot, config.inboundDir);
  }
  if (destination === 'Outbound') {
    return path.join(config.storageRoot, config.outboundDir);
  }
  return null;
}

function buildHttpsOptions() {
  if (!config.httpsEnabled) {
    return undefined;
  }

  if (!config.httpsKeyPath || !config.httpsCertPath) {
    throw new Error('HTTPS_ENABLED=true but HTTPS_KEY_PATH or HTTPS_CERT_PATH is missing');
  }

  return {
    key: fs.readFileSync(config.httpsKeyPath),
    cert: fs.readFileSync(config.httpsCertPath)
  };
}

function getWindowsShareRoot(targetPath) {
  if (process.platform !== 'win32' || !targetPath.startsWith('\\\\')) {
    return null;
  }

  const segments = targetPath.replace(/^\\\\/, '').split('\\').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  return `\\\\${segments[0]}\\${segments[1]}`;
}

async function connectStorageShare() {
  const shareRoot = getWindowsShareRoot(config.storageRoot);
  if (!shareRoot || !config.storageUsername || !config.storagePassword) {
    return;
  }

  try {
    await execFileAsync('net', [
      'use',
      shareRoot,
      config.storagePassword,
      `/user:${config.storageUsername}`
    ]);
  } catch (error) {
    const details = `${error.stdout || ''} ${error.stderr || ''}`.trim();
    if (details.includes('1219') || details.toLowerCase().includes('multiple connections')) {
      return;
    }

    throw new Error(`storage authentication failed for ${shareRoot}: ${details || error.message}`);
  }
}

const app = Fastify({
  logger: true,
  bodyLimit: config.maxFileSizeBytes,
  https: buildHttpsOptions()
});

app.register(cors, {
  origin: config.corsOrigin
});

app.register(multipart, {
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: 1
  }
});

app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'frontend'),
  prefix: '/'
});

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
  storageRoot: config.storageRoot,
  destinations: ['ROOT', 'Inbound', 'Outbound'],
  httpsEnabled: config.httpsEnabled,
  storageAuthConfigured: Boolean(config.storageUsername && config.storagePassword)
}));

app.post('/api/upload', async (request, reply) => {
  const filePart = await request.file();
  const destination = filePart?.fields?.destination?.value || 'ROOT';

  if (!filePart) {
    return reply.code(400).send({ ok: false, message: 'image is required' });
  }

  const targetBase = resolveTargetBase(destination);
  if (!targetBase) {
    return reply.code(400).send({ ok: false, message: 'invalid destination' });
  }

  const ext = path.extname(filePart.filename || '').toLowerCase() || '.jpg';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeDestination = safeSegment(destination) || 'ROOT';
  const filename = `${timestamp}__${safeDestination}${ext}`;
  const outputPath = path.join(targetBase, filename);

  await fsp.mkdir(targetBase, { recursive: true });
  await pipeline(filePart.file, fs.createWriteStream(outputPath, { flags: 'wx' }));

  const stats = await fsp.stat(outputPath);
  if (stats.size === 0) {
    await fsp.unlink(outputPath).catch(() => {});
    return reply.code(400).send({ ok: false, message: 'empty image received' });
  }

  return reply.code(201).send({
    ok: true,
    filename,
    outputPath,
    destination,
    size: stats.size
  });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);

  if (error.code === 'FST_PARTS_LIMIT' || error.code === 'FST_FILES_LIMIT') {
    return reply.code(413).send({ ok: false, message: 'too many files' });
  }

  if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ ok: false, message: 'file too large' });
  }

  if (error.code === 'EEXIST') {
    return reply.code(409).send({ ok: false, message: 'duplicate filename generated' });
  }

  return reply.code(500).send({ ok: false, message: error.message || 'internal server error' });
});

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ ok: false, message: 'not found' });
  }

  return reply.sendFile('index.html');
});

async function start() {
  try {
    await connectStorageShare();
    await fsp.mkdir(config.storageRoot, { recursive: true });
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
