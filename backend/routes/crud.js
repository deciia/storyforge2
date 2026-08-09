const { initDb } = require('../db/schema');

const db = initDb();

/**
 * Generic CRUD router factory for any table.
 * Creates 5 endpoints: GET /, GET /:id, POST, PUT /:id, DELETE /:id
 *
 * Each row has a `data` column (TEXT) that is auto-parsed to JSON on read
 * and auto-stringified on write. Known columns are top-level; everything
 * else goes into `data`.
 */
function createRouter(tableName) {
  const router = require('express').Router();
  const colNames = db.prepare(`SELECT * FROM "${tableName}" LIMIT 0`).columns().map(c => c.name);

  const knownColumns = new Set([
    'id', 'projectId', 'name', 'role', 'sortOrder', 'status', 'type',
    'parentId', 'outlineNodeId', 'chapterId', 'sessionId', 'chunkIndex',
    'referenceId', 'category', 'entityName', 'lastChapterId',
    'fromCharacterId', 'toCharacterId', 'fromGroupId', 'toGroupId',
    'characterId', 'locationId', 'codexEntryId', 'domain', 'worldGroupId',
    'targetWorldGroupId', 'sourceChapterId', 'sourceOutlineNodeId',
    'categoryId', 'itemName', 'scope', 'moduleKey', 'isActive', 'isDefault',
    'fileHash', 'timestamp', 'pinned', 'era', 'year', 'level', 'predicate',
    'createdAt', 'updatedAt', 'builtInKey'
  ]);

  function parseRow(row) {
    if (!row) return null;
    const result = { ...row };
    if (result.data && typeof result.data === 'string') {
      try {
        const parsed = JSON.parse(result.data);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          Object.assign(result, parsed);
        else result._rawData = parsed;
      } catch { result._rawData = result.data; }
    }
    delete result.data;
    return result;
  }

  function packRow(body) {
    const known = {};
    const extra = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === 'id') continue;
      if (colNames.includes(k)) known[k] = v;
      else extra[k] = v;
    }
    // Merge client-supplied data (if any) into extra before encoding
    if (body.data !== undefined) {
      const clientData = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
      if (clientData && typeof clientData === 'object' && !Array.isArray(clientData)) {
        Object.assign(extra, clientData);
      }
    }
    known.data = JSON.stringify(extra);
    return known;
  }

  // GET /api/:table — list, supports dynamic ?key=value filtering
  router.get('/', (req, res) => {
    try {
      const whereClauses = [];
      const params = [];

      for (const [key, value] of Object.entries(req.query)) {
        // Only allow filtering on real column names (prevents SQL injection)
        if (colNames.includes(key)) {
          whereClauses.push(`"${key}" = ?`);
          // Attempt numeric parsing for integer columns; fall back to raw string
          const num = Number(value);
          params.push(!isNaN(num) && String(num) === String(value) ? num : value);
        }
      }

      const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM "${tableName}" ${where}`).all(...params);
      res.json(rows.map(parseRow));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/:table/:id
  router.get('/:id', (req, res) => {
    try {
      const row = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(parseInt(req.params.id, 10));
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(parseRow(row));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/:table — create
  router.post('/', (req, res) => {
    try {
      const packed = packRow(req.body);
      const now = Date.now();
      if (colNames.includes('createdAt') && !('createdAt' in packed)) packed.createdAt = now;
      if (colNames.includes('updatedAt') && !('updatedAt' in packed)) packed.updatedAt = now;
      delete packed.id;

      const keys = Object.keys(packed);
      const vals = Object.values(packed);

      const cols = keys.map(k => `"${k}"`).join(', ');
      const markers = keys.map(() => '?').join(', ');

      const stmt = db.prepare(`INSERT INTO "${tableName}" (${cols}) VALUES (${markers})`);
      const info = stmt.run(...vals);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/:table/:id
  router.put('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const packed = packRow(req.body);
      if (colNames.includes('updatedAt')) packed.updatedAt = Date.now();

      // Merge existing `data` JSON bag — partial PUT must NOT drop stored extra fields.
      // (P1 fix 2026-08-09: previously a partial update silently wiped customField etc.)
      if (existing.data) {
        try {
          const oldExtra = typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data;
          const newExtra = typeof packed.data === 'string' ? JSON.parse(packed.data) : (packed.data || {});
          if (oldExtra && typeof oldExtra === 'object' && !Array.isArray(oldExtra)) {
            packed.data = JSON.stringify({ ...oldExtra, ...newExtra });
          }
        } catch { /* keep packed.data as-is */ }
      }

      const keys = Object.keys(packed);
      const setClauses = keys.map(k => `"${k}" = ?`).join(', ');
      const vals = Object.values(packed).concat(id);

      db.prepare(`UPDATE "${tableName}" SET ${setClauses} WHERE id = ?`).run(...vals);

      const updated = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
      res.json(parseRow(updated));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/:table/:id
  router.delete('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      db.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(id);
      res.json({ deleted: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

module.exports = { createRouter };
