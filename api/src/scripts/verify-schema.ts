import { loadConfig } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { verifyOrdersSchema } from '../orders/schema-verify.js';

// Read-only: verifyOrdersSchema only receives find/countDocuments. Output carries key names and JS types, never customer values.
const config = loadConfig();
const database = getDatabase({ uri: config.mongo.uri, dbName: config.mongo.db });
try {
  const { exitCode, lines } = await verifyOrdersSchema(database.db().collection(config.business.collections.orders), new Date());
  console.log(lines.join('\n'));
  process.exitCode = exitCode;
} finally {
  await closeDatabase();
}
