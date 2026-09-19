import 'dotenv/config';
import { openDatabase, migrate } from './db.js';
import { createApp } from './app.js';
// Hostinger's LiteSpeed loader requires this module synchronously. Keep the
// imported module graph free of top-level await; initialize asynchronously here.
async function start() {
  const db = await openDatabase();
  try {
    await migrate(db);
    const app = await createApp(db);
    const configuredPort = Number(process.env.PORT || 3000);
    const server = app.listen(configuredPort, '0.0.0.0', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : configuredPort;
      console.log(`Jobsite Notebook server is ready on port ${port}`);
    });
    server.on('error', async error => {
      console.error('Server failed to listen:', error.code || error.name);
      await db.close();
      process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
  } catch (error) {
    await db.close();
    throw error;
  }
}

start().catch(error => {
  // Do not log connection objects or credentials.
  console.error('Server startup failed:', error.code || error.message);
  process.exitCode = 1;
});
