const express = require('express');
const cors = require('cors');
const path = require('path');
const { createRouter } = require('./routes/crud');
const { domainRouter } = require('./routes/domain');
const { TABLES } = require('./db/schema');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 8765;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Domain routes (context / export / import) — mounted BEFORE generic CRUD
// so /api/projects/:id/context and /api/projects/:id/export win route match.
app.use('/api', domainRouter);

// Cascade delete — registered BEFORE generic CRUD routes so it wins the route match
app.delete('/api/projects/:id/cascade', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = db.prepare('SELECT count(*) AS c FROM projects WHERE id = ?').get(id);
    if (!project || project.c === 0) return res.status(404).json({ error: 'Not found' });

    const tableNames = Object.keys(TABLES).filter(t => t !== 'projects');
    let relatedDeleted = 0;
    for (const t of tableNames) {
      try {
        const info = db.prepare(`DELETE FROM "${t}" WHERE projectId = ?`).run(id);
        relatedDeleted += info.changes;
      } catch (e) { /* table may lack projectId column — skip */ }
    }
    const r = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.json({ deleted: r.changes, relatedDeleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chapters cascade delete
app.delete('/api/chapters/cascade', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });

    const placeholders = ids.map(() => '?').join(',');
    let total = 0;

    const r = db.prepare(`DELETE FROM chapters WHERE id IN (${placeholders})`).run(...ids);
    total += r.changes;

    try { total += db.prepare(`DELETE FROM emotionBeatCards WHERE chapterId IN (${placeholders})`).run(...ids).changes; } catch {}
    try { total += db.prepare(`DELETE FROM retrievalChunks WHERE sourceChapterId IN (${placeholders})`).run(...ids).changes; } catch {}
    try { total += db.prepare(`DELETE FROM narrativeSummaryNodes WHERE sourceChapterId IN (${placeholders})`).run(...ids).changes; } catch {}

    // Detach temporalFacts references
    try { db.prepare(`UPDATE temporalFacts SET sourceChapterId = NULL WHERE sourceChapterId IN (${placeholders})`).run(...ids); } catch {}
    try { db.prepare(`UPDATE temporalFacts SET validFromChapterId = NULL WHERE validFromChapterId IN (${placeholders})`).run(...ids); } catch {}
    try { db.prepare(`UPDATE temporalFacts SET validToChapterId = NULL WHERE validToChapterId IN (${placeholders})`).run(...ids); } catch {}

    res.json({ deleted: total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mount CRUD routes for all tables (58 after v3.9.1 schema sync)
const tableNames = Object.keys(TABLES);
for (const tableName of tableNames) {
  app.use(`/api/${tableName}`, createRouter(tableName));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tables: tableNames.length, tables: tableNames });
});

app.listen(PORT, () => {
  console.log(`StoryForge2 API running on http://localhost:${PORT}`);
  console.log(`${tableNames.length} tables exposed: ${tableNames.join(', ')}`);
});
