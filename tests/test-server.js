const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { buildApp } = require('../backend/server');
(async () => {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'pda-browser-test-'));
  const app = buildApp({ storageRoot: storage, logger: false, httpsEnabled: false, storageUsername: '', storagePassword: '' });
  await app.listen({ host: '127.0.0.1', port: 18091 });
  async function close() {
    await app.close();
    await fs.rm(storage, { recursive: true, force: true });
  }
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
})();
