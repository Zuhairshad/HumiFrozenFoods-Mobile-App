import { loadConfig } from '../config/env.js';
import { closeDatabase, ensureIndexes, getDatabase } from '../db/client.js';

const config = loadConfig();
const database = getDatabase({ uri: config.mongo.uri, dbName: config.mongo.db });
try {
  await ensureIndexes(database.db());
  console.log('Indexes ensured');
} finally {
  await closeDatabase();
}
