/**
 * Integration test for StoryForge2 backend.
 * Boots server on port 8767, runs CRUD assertions on 3 core tables, exits.
 */
const http = require('http');
const path = require('path');

// Override port before importing server
process.env.PORT = 8767;

const express = require('express');
const cors = require('cors');
const { createRouter } = require('./routes/crud');
const { TABLES } = require('./db/schema');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', tables: Object.keys(TABLES).length }));
for (const tableName of Object.keys(TABLES)) {
  app.use(`/api/${tableName}`, createRouter(tableName));
}

const BASE = 'http://localhost:8767';

function fetch(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + url);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let passed = 0;
let failed = 0;

function check(desc, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc} — ${detail}`);
    failed++;
  }
}

async function testTable(name, createBody) {
  console.log(`\n── ${name} ──`);

  // POST
  const r1 = await fetch('POST', `/api/${name}`, createBody);
  check(`POST /api/${name} → 201`, r1.status === 201, `got ${r1.status}: ${JSON.stringify(r1.body)}`);
  const id = r1.body?.id || r1.body?.lastInsertRowid;
  if (!id) return;

  // GET by id
  const r2 = await fetch('GET', `/api/${name}/${id}`);
  check(`GET /api/${name}/${id} → 200`, r2.status === 200, `got ${r2.status}`);

  // PUT
  const r3 = await fetch('PUT', `/api/${name}/${id}`, { name: 'Updated ' + name, status: 'completed' });
  check(`PUT /api/${name}/${id} → 200`, r3.status === 200, `got ${r3.status}: ${JSON.stringify(r3.body)}`);

  // DELETE
  const r4 = await fetch('DELETE', `/api/${name}/${id}`);
  check(`DELETE /api/${name}/${id} → 200`, r4.status === 200, `got ${r4.status}`);

  // Verify deleted
  const r5 = await fetch('GET', `/api/${name}/${id}`);
  check(`GET deleted /api/${name}/${id} → 404`, r5.status === 404, `got ${r5.status}`);
}

(async () => {
  const server = app.listen(8767, async () => {
    console.log('Test server on :8767');

    try {
      // Health check
      const h = await fetch('GET', '/api/health');
      check('GET /api/health → 200', h.status === 200, `got ${h.status}`);
      check('health reports all tables', h.body?.tables === Object.keys(TABLES).length, `got ${h.body?.tables}`);

      // Core tables
      await testTable('projects', {
        name: 'Test Project',
        status: 'drafting',
        description: 'Integration test',
        genre: 'other',
        genres: ['other'],
        targetWordCount: 100000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await testTable('characters', {
        projectId: 1,
        name: 'Test Character',
        role: 'protagonist',
        roleWeight: 'main',
        moralAxis: 'good',
        orderAxis: 'neutral',
        shortDescription: 'A test character',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await testTable('chapters', {
        projectId: 1,
        sortOrder: 1,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Test error:', err);
      failed++;
    }

    console.log(`\n─── ${passed + failed} assertions: ${passed} passed, ${failed} failed ───`);
    server.close(() => process.exit(failed > 0 ? 1 : 0));
  });
})();
