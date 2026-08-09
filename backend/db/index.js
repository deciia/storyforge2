const { initDb, DB_PATH } = require('./schema');
const db = initDb();
module.exports = { db, DB_PATH };
