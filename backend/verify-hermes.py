#!/usr/bin/env python3
"""One-shot verification: boot Express server → hermes_client CRUD → report → exit."""
import subprocess, time, urllib.request, json, os, sys

BACKEND = r'C:\Users\Administrator\repos-test\storyforge2\backend'
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

# Start server detached so bash can't kill it
log = open(os.path.join(BACKEND, 'verify.log'), 'w')
proc = subprocess.Popen(
    ['node', 'server.js'],
    stdout=log, stderr=subprocess.STDOUT,
    creationflags=subprocess.DETACHED_PROCESS | 0x00000200  # CREATE_NEW_PROCESS_GROUP
)
print(f'Server PID: {proc.pid}')

# Wait for port
for i in range(30):
    time.sleep(0.5)
    try:
        r = urllib.request.urlopen('http://localhost:8765/api/health', timeout=2)
        health = json.loads(r.read())
        print(f'Server alive: {health}')
        break
    except:
        if i == 29: print('TIMEOUT'); sys.exit(1)

# Import hermes_client and verify
import importlib.util
spec = importlib.util.spec_from_file_location('hermes_client', os.path.join(BACKEND, 'hermes_client.py'))
sf2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sf2)

passed = 0
def check(desc, ok, detail=''):
    global passed
    if ok:
        print(f'  ✓ {desc}')
        passed += 1
    else:
        print(f'  ✗ FAIL: {desc} — {detail}')

# CREATE
p = sf2.create('projects', {
    'name': 'Hermes控制验证',
    'status': 'drafting',
    'genre': 'xuanhuan',
    'genres': ['xuanhuan'],
    'targetWordCount': 1000000,
    'description': '阶段一终验',
    'createdAt': int(time.time() * 1000),
    'updatedAt': int(time.time() * 1000),
})
check('POST /api/projects', 'id' in p and p.get('id') > 0, str(p))
pid = p.get('id')

# LIST
r = sf2.list('projects')
check('GET /api/projects → list', isinstance(r, list) and len(r) > 0, str(r))
check('  project in list', any(item.get('name') == 'Hermes控制验证' for item in r))

# GET
r = sf2.get('projects', pid)
check(f'GET /api/projects/{pid}', r and r.get('name') == 'Hermes控制验证', str(r))

# UPDATE
r = sf2.update('projects', pid, {'name': 'Hermes控制验证-已修改', 'status': 'ongoing'})
check(f'PUT /api/projects/{pid}', r and r.get('name') == 'Hermes控制验证-已修改', str(r))

# DELETE
r = sf2.delete('projects', pid)
check(f'DELETE /api/projects/{pid}', r and r.get('deleted') == True, str(r))

# Verify deleted
r = sf2.get('projects', pid)
check('GET deleted → 404', isinstance(r, dict) and 'error' in r, str(r))

# CHARACTER — full lifecycle
c = sf2.create('characters', {
    'projectId': 1, 'name': 'AI验证角色',
    'role': 'protagonist', 'roleWeight': 'main',
    'moralAxis': 'good', 'orderAxis': 'neutral',
    'shortDescription': 'Hermes创建的角色',
    'createdAt': int(time.time() * 1000),
    'updatedAt': int(time.time() * 1000),
})
check('POST /api/characters', 'id' in c, str(c))
cid = c.get('id')
r = sf2.get('characters', cid)
check(f'GET /api/characters/{cid}', r and r.get('name') == 'AI验证角色', str(r))
sf2.delete('characters', cid)

print(f'\n─── {passed} assertions passed ───')
if passed >= 9:
    print('✅ HERMES 可以控制 StoryForge2 后端')
else:
    print('❌ 验证失败')

# Kill server
proc.terminate()
