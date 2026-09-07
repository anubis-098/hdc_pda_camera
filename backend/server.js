'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Transform } = require('node:stream');
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

const projectRoot = path.join(__dirname, '..');

function buildApp(overrides = {}) {

  const config = {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 8090),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    storageRoot: process.env.STORAGE_ROOT || path.join(projectRoot, 'uploads'),
    inboundDir: process.env.INBOUND_DIR || 'Inbound',
    returnDir: process.env.RETURN_DIR || 'Return',
    outboundDir: process.env.OUTBOUND_DIR || 'Outbound',
    otherDir: process.env.OTHER_DIR || 'Other',
    maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024,
    httpsEnabled: String(process.env.HTTPS_ENABLED || 'false').toLowerCase() === 'true',
    httpsKeyPath: process.env.HTTPS_KEY_PATH || '',
    httpsCertPath: process.env.HTTPS_CERT_PATH || '',
    storageUsername: process.env.STORAGE_USERNAME || '',
    storagePassword: process.env.STORAGE_PASSWORD || '',
    ...overrides
  };
  config.storageRoot = path.resolve(config.storageRoot);
  const destinationDirs = {
    Inbound: config.inboundDir, Return: config.returnDir,
    Outbound: config.outboundDir, Other: config.otherDir
  };
  for (const name of Object.values(destinationDirs)) {
    if (!name || name === '.' || name.includes('..') || /[\\/]/.test(name) || path.isAbsolute(name)) {
      throw new Error('Storage folder names must be simple directory names');
    }
  }

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
    return Object.hasOwn(destinationDirs, destination)
      ? path.join(config.storageRoot, destinationDirs[destination]) : null;
  }

  const imageMimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };

  function resolveImagePath(destination, filename) {
    const targetBase = resolveTargetBase(destination);
    const safeFilename = safeSegment(filename);
    const extension = path.extname(filename || '').toLowerCase();
    if (!targetBase || destination === 'ROOT' || !safeFilename || safeFilename !== filename || !imageMimeTypes[extension]) {
      return null;
    }

    const basePath = path.resolve(targetBase);
    const imagePath = path.resolve(basePath, safeFilename);
    if (!imagePath.startsWith(`${basePath}${path.sep}`)) {
      return null;
    }

    return imagePath;
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

      throw new Error(`storage authentication failed for ${shareRoot}: ${details || 'check the configured credentials'}`);
    }
  }

  const app = Fastify({
    logger: overrides.logger ?? true,
    bodyLimit: config.maxFileSizeBytes,
    https: buildHttpsOptions()
  });

  app.register(cors, {
    origin: config.corsOrigin
  });

  app.register(multipart, {
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: 1,
      fields: 1,
      parts: 2,
      fieldSize: 100
    }
  });

  app.register(fastifyStatic, {
    root: path.join(projectRoot, 'frontend'),
    prefix: '/',
    maxAge: 0
  });

  app.get('/api/health', async () => ({
    ok: true,
    time: new Date().toISOString(),
    storageRoot: config.storageRoot,
    destinations: ['Inbound', 'Return', 'Outbound', 'Other'],
    httpsEnabled: config.httpsEnabled,
    storageAuthConfigured: Boolean(config.storageUsername && config.storagePassword)
  }));

  app.get('/api/images', async (request, reply) => {
    const destination = request.query?.destination || 'Return';
    const targetBase = resolveTargetBase(destination);
    if (!targetBase || destination === 'ROOT') {
      return reply.code(400).send({ ok: false, message: 'invalid gallery folder' });
    }

    let entries;
    try {
      entries = await fsp.readdir(targetBase, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { ok: true, destination, images: [] };
      }
      throw error;
    }

    const images = [];
    for (const entry of entries) {
      if (!entry.isFile() || !imageMimeTypes[path.extname(entry.name).toLowerCase()]) {
        continue;
      }

      const imagePath = resolveImagePath(destination, entry.name);
      if (!imagePath) {
        continue;
      }

      const stats = await fsp.lstat(imagePath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!stats?.isFile()) continue;
      images.push({
        filename: entry.name,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        url: `/api/images/${encodeURIComponent(destination)}/${encodeURIComponent(entry.name)}`
      });
    }

    images.sort((first, second) => second.modifiedAt.localeCompare(first.modifiedAt));
    return { ok: true, destination, images };
  });

  app.get('/api/images/:destination/:filename', async (request, reply) => {
    const { destination, filename } = request.params;
    const imagePath = resolveImagePath(destination, filename);
    if (!imagePath) {
      return reply.code(400).send({ ok: false, message: 'invalid image path' });
    }

    try {
      const stats = await fsp.lstat(imagePath);
      if (!stats.isFile()) {
        return reply.code(404).send({ ok: false, message: 'image not found' });
      }
      return reply.type(imageMimeTypes[path.extname(filename).toLowerCase()]).send(fs.createReadStream(imagePath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return reply.code(404).send({ ok: false, message: 'image not found' });
      }
      throw error;
    }
  });

  app.delete('/api/images/:destination/:filename', async (request, reply) => {
    const { destination, filename } = request.params;
    const imagePath = resolveImagePath(destination, filename);
    if (!imagePath) {
      return reply.code(400).send({ ok: false, message: 'invalid image path' });
    }

    try {
      await fsp.unlink(imagePath);
      return { ok: true, destination, filename };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return reply.code(404).send({ ok: false, message: 'image not found' });
      }
      throw error;
    }
  });

  app.post('/api/upload', async (request, reply) => {
    let tempPath;
    let destination;
    let bytes = 0;
    const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname !== 'destination' || destination !== undefined || part.valueTruncated) {
            throw invalid('invalid destination field');
          }
          destination = part.value;
          continue;
        }
        if (tempPath || part.fieldname !== 'image' || part.mimetype !== 'image/jpeg') {
          throw invalid('one JPEG image is required');
        }
        await fsp.mkdir(config.storageRoot, { recursive: true });
        tempPath = path.join(config.storageRoot, `.upload-${randomUUID()}.part`);
        let header = Buffer.alloc(0);
        let tail = Buffer.alloc(0);
        const validate = new Transform({
          transform(chunk, encoding, callback) {
            bytes += chunk.length;
            if (header.length < 3) header = Buffer.concat([header, chunk.subarray(0, 3 - header.length)]);
            tail = Buffer.concat([tail, chunk.subarray(Math.max(0, chunk.length - 2))]).subarray(-2);
            callback(null, chunk);
          },
          flush(callback) {
            if (part.file.truncated) return callback(Object.assign(new Error('file too large'), { statusCode: 413 }));
            const valid = bytes > 4 && header.equals(Buffer.from([255, 216, 255])) && tail.equals(Buffer.from([255, 217]));
            callback(valid ? null : invalid('incomplete or invalid JPEG image'));
          }
        });
        await pipeline(part.file, validate, fs.createWriteStream(tempPath, { flags: 'wx' }));
        if (part.file.truncated) throw Object.assign(new Error('file too large'), { statusCode: 413 });
      }
      if (!tempPath) throw invalid('image is required');
      const targetBase = resolveTargetBase(destination);
      if (!targetBase) throw invalid('invalid destination');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}__${destination}__${randomUUID()}.jpg`;
      const outputPath = path.join(targetBase, filename);
      await fsp.mkdir(targetBase, { recursive: true });
      await fsp.rename(tempPath, outputPath);
      tempPath = null;
      return reply.code(201).send({ ok: true, filename, destination, size: bytes });
    } finally {
      if (tempPath) await fsp.unlink(tempPath).catch((error) => request.log.error(error, 'Temporary upload cleanup failed'));
    }
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

    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({ ok: false, message: status < 500 ? error.message : 'Storage operation failed; check server logs and storage permissions' });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ ok: false, message: 'not found' });
    }

    return reply.code(404).send({ ok: false, message: 'not found' });
  });

  app.addHook('onReady', connectStorageShare);
  return app;
}

module.exports = { buildApp };
if (require.main === module) {
  loadEnvFile(path.join(projectRoot, '.env'));
  const app = buildApp();
  app.listen({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 8090) }).catch((error) => {
    app.log.error(error);
    process.exitCode = 1;
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close());
}
