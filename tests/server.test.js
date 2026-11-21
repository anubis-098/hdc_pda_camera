const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildApp } = require('../backend/server');
let app, storage;
const jpeg = Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]);
before(async () => {
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'pda-api-test-'));
  app = buildApp({ storageRoot: storage, maxFileSizeBytes: 1024, logger: false, httpsEnabled: false, storageUsername: '', storagePassword: '' });
  await app.ready();
});
after(async () => {
  await app.close();
  await fs.rm(storage, { recursive: true, force: true });
});
function upload(destination, bytes = jpeg, fileFirst = false, extra = '') {
  const field = Buffer.from(`--pda-boundary\r\nContent-Disposition: form-data; name="destination"\r\n\r\n${destination}\r\n`);
  const file = Buffer.concat([Buffer.from('--pda-boundary\r\nContent-Disposition: form-data; name="image"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'), bytes, Buffer.from('\r\n')]);
  return app.inject({ method: 'POST', url: '/api/upload', headers: { 'content-type': 'multipart/form-data; boundary=pda-boundary' },
    payload: Buffer.concat([...(fileFirst ? [file, field] : [field, file]), Buffer.from(extra + '--pda-boundary--\r\n')]) });
}
test('save, list, read and delete from Other or a custom folder using either multipart order', async () => {
  const custom = 'Receiving Monday';
  assert.equal((await app.inject({ method: 'POST', url: '/api/folders', payload: { name: custom } })).statusCode, 201);
  for (const destination of ['Other', custom]) {
    const response = await upload(destination, jpeg, destination === custom);
    assert.equal(response.statusCode, 201, response.body);
    const result = response.json();
    assert.equal(result.destination, destination);
    assert.deepEqual(await fs.readFile(path.join(storage, destination, result.filename)), jpeg);
    const list = (await app.inject(`/api/images?destination=${encodeURIComponent(destination)}`)).json();
    assert.equal(list.images.length, 1);
    assert.deepEqual((await app.inject(list.images[0].url)).rawPayload, jpeg);
    assert.equal((await app.inject({ method: 'DELETE', url: list.images[0].url })).statusCode, 200);
  }
});
test('simultaneous uploads have unique filenames', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => upload('Other')));
  assert.ok(results.every((r) => r.statusCode === 201));
  assert.equal(new Set(results.map((r) => r.json().filename)).size, 8);
});
test('prepares Other, hides legacy folders and persists newly created folder names', async () => {
  const root = path.join(storage, 'folder-preparation');
  const instance = buildApp({ storageRoot: root, logger: false, httpsEnabled: false });
  try {
    const target = path.join(root, 'Other');
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
    const prepare = () => instance.inject({ method: 'PUT', url: '/api/folders/Other' });
    assert.equal((await prepare()).statusCode, 200);
    const photo = path.join(target, 'existing.jpg');
    await fs.writeFile(photo, jpeg);
    assert.equal((await prepare()).statusCode, 200);
    assert.deepEqual(await fs.readFile(photo), jpeg);

    for (const name of ['Inbound', 'Return', 'Outbound']) await fs.mkdir(path.join(root, name));
    const create = (name) => instance.inject({ method: 'POST', url: '/api/folders', payload: { name } });
    for (const name of ['Inbound', 'Return', 'Outbound', 'Other', '../Custom', 'NUL.txt']) {
      assert.equal((await create(name)).statusCode, 400);
    }
    const name = 'รับสินค้า 1';
    assert.equal((await create(name)).statusCode, 201);
    assert.equal((await create(name)).statusCode, 409);
    assert.equal((await instance.inject('/api/images?destination=Return')).statusCode, 400);
    assert.deepEqual((await instance.inject('/api/folders')).json().folders, ['Other', name]);
  } finally {
    await instance.close();
  }
});
test('invalid destinations, empty/corrupt JPEGs and oversized images leave no temp files', async () => {
  for (const folder of ['ROOT', '../Other', '', '__proto__']) assert.equal((await upload(folder)).statusCode, 400);
  for (const bytes of [Buffer.alloc(0), Buffer.from('not a photo'), jpeg.subarray(0, -2)]) {
    assert.equal((await upload('Other', bytes)).statusCode, 400);
  }
  assert.equal((await upload('Other', Buffer.concat([jpeg.subarray(0, 3), Buffer.alloc(2048), jpeg.subarray(-2)]))).statusCode, 413);
  assert.deepEqual((await fs.readdir(storage)).filter((name) => name.endsWith('.part')), []);
  assert.equal((await app.inject('/api/images?destination=ROOT')).statusCode, 400);
});
test('extra multipart fields are rejected and cleaned up', async () => {
  const extra = '--pda-boundary\r\nContent-Disposition: form-data; name="extra"\r\n\r\nvalue\r\n';
  assert.equal((await upload('Other', jpeg, false, extra)).statusCode, 413);
  assert.deepEqual((await fs.readdir(storage)).filter((name) => name.endsWith('.part')), []);
});
test('static assets and missing resources return correct types/status', async () => {
  assert.match((await app.inject('/')).headers['content-type'], /text\/html/);
  assert.match((await app.inject('/capture-utils.js')).headers['content-type'], /javascript/);
  assert.equal((await app.inject('/missing.css')).statusCode, 404);
});

test('disconnecting during a file stream removes the partial upload', async () => {
  const http = require('node:http');
  const { setTimeout: delay } = require('node:timers/promises');
  await app.listen({ host: '127.0.0.1', port: 0 });
  const request = http.request({ host: '127.0.0.1', port: app.server.address().port, path: '/api/upload', method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=partial' } });
  request.on('error', () => {});
  request.write('--partial\r\nContent-Disposition: form-data; name="destination"\r\n\r\nOther\r\n--partial\r\nContent-Disposition: form-data; name="image"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
  request.write(jpeg.subarray(0, -2));
  async function temporaryFiles() { return (await fs.readdir(storage)).filter((name) => name.endsWith('.part')); }
  try {
    for (let i = 0; i < 40 && !(await temporaryFiles()).length; i++) await delay(25);
    assert.equal((await temporaryFiles()).length, 1);
  } finally {
    request.destroy();
  }
  for (let i = 0; i < 40 && (await temporaryFiles()).length; i++) await delay(25);
  assert.deepEqual(await temporaryFiles(), []);
});
