/**
 * Domain routes for StoryForge2 backend — Hermes control layer.
 * Mounted BEFORE the generic CRUD loop in server.js so that
 * /api/projects/:id/context and /api/projects/:id/export are not
 * swallowed by the generic GET /api/projects/:id.
 *
 * Endpoints:
 *   GET  /api/projects/:id/context  — assembled project context (no chapter content)
 *   GET  /api/projects/:id/export   — full project dump (all tables, all content)
 *   POST /api/projects/import       — rebuild a project from an export dump (transactional)
 */
const express = require('express');
const { db } = require('../db');
const { TABLES } = require('../db/schema');

const router = express.Router();

/** Same merge semantics as crud.js parseRow: parse `data` JSON into top-level fields. */
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

/** Mirror of crud.js packRow: known columns top-level, everything else into `data` JSON. */
function packRow(body, colNames) {
  const known = {};
  const extra = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'id') continue;
    if (colNames.includes(k)) known[k] = v;
    else extra[k] = v;
  }
  if (Object.keys(extra).length && colNames.includes('data')) {
    let base = {};
    if (known.data !== undefined) {
      if (typeof known.data === 'string') {
        try { base = JSON.parse(known.data); } catch { base = {}; }
      } else if (typeof known.data === 'object' && known.data !== null && !Array.isArray(known.data)) {
        base = known.data;
      }
    }
    Object.assign(base, extra);
    known.data = JSON.stringify(base);
  }
  return known;
}

/** Tables that are project-scoped (have a projectId column). */
const PROJECT_TABLES = Object.keys(TABLES).filter(t => {
  try {
    const cols = db.prepare(`SELECT * FROM "${t}" LIMIT 0`).columns().map(c => c.name);
    return cols.includes('projectId');
  } catch { return false; }
});

/** Order matters: tables referenced by others must be inserted first for clean id remapping. */
const IMPORT_ORDER = [
  'projects',
  'worldviews', 'storyCores', 'powerSystems', 'characters', 'outlineNodes',
  'chapters', 'foreshadows', 'geographies', 'histories', 'creativeRules',
  'characterRelations', 'snapshots', 'references', 'promptTemplates',
  'detailedOutlines', 'importJobs', 'promptWorkflows', 'importSessions',
  'importLogs', 'importFiles', 'stateCards', 'emotionBeatCards',
  'referenceChunkAnalysis', 'worldNodes', 'storyArcs', 'notes',
  'historicalTimelineEvents', 'historicalKeywords', 'importantLocations',
  'worldRulesProfiles', 'worldGroups', 'worldGroupLinks', 'itemLedger',
  'storyTimelineEvents', 'codexCategories', 'codexEntries', 'aiUsageLog',
  'userStyleProfiles', 'temporalFacts', 'retrievalChunks', 'narrativeSummaryNodes',
  // ── v3.9.1 新增表（dependency-safe 顺序）──
  'referenceAnalysisRuns', 'referenceAnalysisSources',
  'cultivationSystems', 'cultivationProgress',
  'characterDrivenPlans', 'inspirationWorkspaces', 'knowledgeLedger',
  'storylineProgress', 'storylineCrossings',
  'agentConversations', 'agentEvents',
  'nodeFlows', 'nodeRuns',
  'simulationSessions', 'simulationEvents', 'simulationCheckpoints',
  // ── P0 fix 2026-08-09: 对齐 Dexie 的 7 张缺失表 ──
  'factions', 'itemSystems',
  'masterWorks', 'masterChapterBeats', 'masterChunkAnalysis',
  'masterStyleMetrics', 'masterInsights'
];

/**
 * Foreign-key-ish columns → table they reference.
 * Used to remap old ids to new ids during import.
 * NOTE: `parentId` is deliberately NOT here — it is self-referential
 * per-table (outlineNodes.parentId → outlineNodes) and handled separately.
 */
const FK_COLUMN_TABLE = {
  outlineNodeId: 'outlineNodes',
  sourceOutlineNodeId: 'outlineNodes',
  chapterId: 'chapters',
  sourceChapterId: 'chapters',
  characterId: 'characters',
  fromCharacterId: 'characters',
  toCharacterId: 'characters',
  referenceId: 'references',
  fromGroupId: 'worldGroups',
  toGroupId: 'worldGroups',
  worldGroupId: 'worldGroups',
  targetWorldGroupId: 'worldGroups',
  locationId: 'importantLocations',
  codexEntryId: 'codexEntries',
  categoryId: 'codexCategories',
  sessionId: 'importSessions',
  conversationId: 'agentConversations',
  cultivationSystemId: 'cultivationSystems',
  arcId: 'storyArcs',
  arcIdA: 'storyArcs',
  arcIdB: 'storyArcs',
  lastActiveChapterId: 'chapters',
  workId: 'masterWorks',
};

/**
 * Per-table FK overrides — a column may reference different tables in
 * different contexts (e.g. simulationEvents.sessionId → simulationSessions,
 * while importLogs.sessionId → importSessions).
 */
const FK_OVERRIDES = {
  simulationEvents: { sessionId: 'simulationSessions' },
  simulationCheckpoints: { sessionId: 'simulationSessions' },
};

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:id/context
// Assembled snapshot of a project for Hermes to understand before writing.
// Chapter CONTENT is intentionally excluded — fetch via GET /api/chapters/:id.
// ─────────────────────────────────────────────────────────────
router.get('/projects/:id/context', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const pick = (table, limit = 500) =>
      db.prepare(`SELECT * FROM "${table}" WHERE projectId = ? LIMIT ?`).all(id, limit).map(parseRow);

    const outlineNodes = pick('outlineNodes');
    const chaptersMeta = pick('chapters')
      .map(({ content, ...meta }) => meta); // strip content

    const ctx = {
      project: parseRow(project),
      worldviews: pick('worldviews'),
      storyCores: pick('storyCores'),
      powerSystems: pick('powerSystems'),
      characters: pick('characters'),
      outlineNodes,
      chapters: chaptersMeta,
      foreshadows: pick('foreshadows'),
      geographies: pick('geographies'),
      histories: pick('histories'),
      creativeRules: pick('creativeRules'),
      characterRelations: pick('characterRelations'),
      storyArcs: pick('storyArcs'),
      notes: pick('notes'),
      counts: {},
    };
    for (const t of PROJECT_TABLES) {
      if (t === 'projects') continue;
      try {
        ctx.counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}" WHERE projectId = ?`).get(id).c;
      } catch { /* skip */ }
    }
    res.json(ctx);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:id/export
// Full dump: project + every project-scoped table with ALL content.
// ─────────────────────────────────────────────────────────────
router.get('/projects/:id/export', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const dump = {
      _meta: {
        schemaVersion: '1.0',
        exportedAt: Date.now(),
        sourceProjectId: id,
      },
      project: parseRow(project),
    };
    for (const t of PROJECT_TABLES) {
      if (t === 'projects') continue;
      try {
        dump[t] = db.prepare(`SELECT * FROM "${t}" WHERE projectId = ?`).all(id).map(parseRow);
      } catch { /* table lacks projectId column — skip */ }
    }
    res.json(dump);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────
// POST /api/projects/import
// Transactional rebuild: project + all child tables, remapping ids
// so foreign keys survive. Directly addresses blueprint P0-5.
// ─────────────────────────────────────────────────────────────
router.post('/projects/import', (req, res) => {
  const body = req.body || {};
  const projectData = body.project;
  if (!projectData) return res.status(400).json({ error: 'project required' });

  try {
    const idMap = {};        // { table: { oldId: newId } }
    const oldRows = {};      // { table: [original rows from body] }
    const imported = {};     // counts
    let newProjectId = null;

    const insertTx = db.transaction(() => {
      // 1. Insert project (mirror packRow: known cols top-level, rest into data)
      const pCols = db.prepare('SELECT * FROM projects LIMIT 0').columns().map(c => c.name);
      const pPacked = packRow(projectData, pCols);
      delete pPacked.id;
      const now = Date.now();
      if (!('createdAt' in pPacked)) pPacked.createdAt = now;
      if (!('updatedAt' in pPacked)) pPacked.updatedAt = now;
      const pKeys = Object.keys(pPacked);
      const pInfo = db.prepare(
        `INSERT INTO projects (${pKeys.map(k => `"${k}"`).join(', ')}) VALUES (${pKeys.map(() => '?').join(', ')})`
      ).run(...Object.values(pPacked));
      newProjectId = pInfo.lastInsertRowid;
      imported.projects = 1;

      // 2. Insert child tables in dependency order
      const tableNames = IMPORT_ORDER.filter(t => t !== 'projects');
      for (const t of tableNames) {
        const rows = body[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const cols = db.prepare(`SELECT * FROM "${t}" LIMIT 0`).columns().map(c => c.name);
        const insertCols = cols.filter(c => c !== 'id');
        idMap[t] = {};
        oldRows[t] = rows;

        const insertOne = db.prepare(
          `INSERT INTO "${t}" (${insertCols.map(c => `"${c}"`).join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`
        );

        for (const row of rows) {
          const packed = packRow(row, cols);
          delete packed.id;
          const vals = insertCols.map(c => {
            if (c === 'projectId') return newProjectId; // always rebind
            const v = packed[c];
            return v === undefined ? null : v;
          });
          const info = insertOne.run(...vals);
          if (row.id !== undefined) idMap[t][row.id] = info.lastInsertRowid;
        }
        imported[t] = rows.length;
      }

      // 3. Remap FK columns to new ids (iterate idMap — oldId → newId)
      for (const t of tableNames) {
        const map = idMap[t];
        const sourceRows = oldRows[t];
        if (!map || !sourceRows) continue;

        const cols = db.prepare(`SELECT * FROM "${t}" LIMIT 0`).columns().map(c => c.name);
        const fkCols = cols.filter(c => {
          const tgt = (FK_OVERRIDES[t] && FK_OVERRIDES[t][c]) || FK_COLUMN_TABLE[c];
          return tgt && idMap[tgt];
        });
        const hasSelfParent = cols.includes('parentId');

        if (fkCols.length === 0 && !hasSelfParent) continue;

        const setCols = [...fkCols];
        if (hasSelfParent) setCols.push('parentId');
        const updateStmt = db.prepare(
          `UPDATE "${t}" SET ${setCols.map(c => `"${c}" = ?`).join(', ')} WHERE id = ?`
        );

        for (const [oldIdStr, newId] of Object.entries(map)) {
          const oldId = parseInt(oldIdStr, 10);
          const oldRow = sourceRows.find(r => r.id === oldId);
          if (!oldRow) continue;

          const newVals = setCols.map(c => {
            const oldVal = oldRow[c];
            if (oldVal == null) return null;
            if (c === 'parentId' && hasSelfParent) {
              // self-referential: parentId remaps through this table's own idMap
              return map[oldVal] != null ? map[oldVal] : oldVal;
            }
            const tgt = (FK_OVERRIDES[t] && FK_OVERRIDES[t][c]) || FK_COLUMN_TABLE[c];
            const targetMap = idMap[tgt];
            return targetMap && targetMap[oldVal] != null ? targetMap[oldVal] : oldVal;
          });
          updateStmt.run(...newVals, newId);
        }
      }
    });

    insertTx();
    res.status(201).json({ id: newProjectId, imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { domainRouter: router, PROJECT_TABLES };
