#!/usr/bin/env python3
"""StoryForge2 (SF2) — Hermes 完全控制层 Python SDK.

Usage:
    import hermes_client as sf2
    sf2.health()
    sf2.list_projects()
    sf2.context(11)                  # 组装好的项目上下文
    sf2.export(11)                   # 全量导出（含 content）
    sf2.import_from_export(11, "新项目名")
    sf2.update_chapter_content(11, 1, "新的正文...")
    sf2.create('characters', {...})
"""

import json
import urllib.request
import urllib.error

BASE = 'http://localhost:8765/api'


class SF2Error(Exception):
    pass


def _req(method, path, body=None, timeout=120):
    url = f'{BASE}/{path}'
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            raw = json.loads(raw)
        except Exception:
            pass
        raise SF2Error(f'HTTP {e.code}: {json.dumps(raw, ensure_ascii=False)[:500]}')
    except Exception as e:
        raise SF2Error(f'Network: {e}')


# ── 系统 ──────────────────────────────────────────────
def health():
    return _req('GET', 'health')


# ── 项目级 ────────────────────────────────────────────
def list_projects():
    return _req('GET', 'projects')


def get_project(pid):
    return _req('GET', f'projects/{pid}')


def create_project(body):
    return _req('POST', 'projects', body)


def update_project(pid, body):
    return _req('PUT', f'projects/{pid}', body)


def delete_project(pid):
    return _req('DELETE', f'projects/{pid}')


def cascade_delete_project(pid):
    """删除项目 + 所有关联表数据（连带删除）。"""
    return _req('DELETE', f'projects/{pid}/cascade')


# ── 领域端点 ──────────────────────────────────────────
def context(pid):
    """组装好的项目上下文：project + 世界观 + 角色 + 大纲 + 章节元数据 + counts。"""
    return _req('GET', f'projects/{pid}/context')


def export(pid):
    """全量导出：所有表，章节含 content。"""
    return _req('GET', f'projects/{pid}/export')


def import_data(data):
    """导入完整项目数据（export 的输出）。返回新项目 id。"""
    return _req('POST', 'projects/import', data)


def import_from_export(pid, new_name=None):
    """导出 pid 项目 → 改名 → 导入为新项目。返回新项目 id。"""
    data = export(pid)
    data['project'] = dict(data.get('project') or {})
    if new_name:
        data['project']['name'] = new_name
    data['project']['id'] = None
    result = import_data(data)
    return result.get('id') or result.get('projectId') or result.get('newId')


# ── 通用 58 表 CRUD ───────────────────────────────────
def list(table, project_id=None):
    qs = f'?projectId={project_id}' if project_id else ''
    return _req('GET', f'{table}{qs}')


def get(table, id):
    return _req('GET', f'{table}/{id}')


def create(table, body):
    return _req('POST', table, body)


def update(table, id, body):
    return _req('PUT', f'{table}/{id}', body)


def delete(table, id):
    return _req('DELETE', f'{table}/{id}')


# ── 批量 ──────────────────────────────────────────────
def bulk_create(table, rows):
    """逐行创建（后端无批量端点，循环 POST）。返回每行的 id 列表。"""
    ids = []
    for row in rows:
        r = create(table, row)
        ids.append(r.get('id') if isinstance(r, dict) else r)
    return ids


def bulk_update(table, rows):
    """逐行更新（每行须含 id）。"""
    out = []
    for row in rows:
        rid = row.pop('id')
        out.append(update(table, rid, row))
    return out


# ── 高频便捷方法 ──────────────────────────────────────
def chapters(pid, with_content=False):
    rows = list('chapters', pid)
    if not with_content:
        for c in rows:
            c.pop('content', None)
    return rows


def characters(pid):
    return list('characters', pid)


def outline(pid):
    return list('outlineNodes', pid)


def worldview(pid):
    return list('worldviews', pid)


def update_chapter_content(pid, chapter_id, content):
    """精修小说最常用：直接替换章节正文。"""
    target = get('chapters', chapter_id)
    if not isinstance(target, dict) or 'id' not in target:
        raise SF2Error(f'chapter {chapter_id} not found in project {pid}')
    target['content'] = content
    return update('chapters', chapter_id, target)


def get_chapter(pid, chapter_id):
    return get('chapters', chapter_id)


# ── 便捷别名 ──────────────────────────────────────────
def sf2_help():
    return {
        '项目': ['list_projects', 'get_project', 'create_project', 'update_project',
                 'delete_project', 'cascade_delete_project'],
        '领域': ['context(pid)', 'export(pid)', 'import_data(data)',
                 'import_from_export(pid, new_name)'],
        '通用CRUD': ['list(table, project_id)', 'get(table, id)', 'create(table, body)',
                     'update(table, id, body)', 'delete(table, id)'],
        '批量': ['bulk_create(table, rows)', 'bulk_update(table, rows)'],
        '章节': ['chapters(pid)', 'update_chapter_content(pid, cid, content)',
                 'get_chapter(pid, cid)'],
    }


if __name__ == '__main__':
    import sys
    print('SF2 SDK 自检:')
    h = health()
    print(f'  health: {h["status"]} | tables: {len(h["tables"])}')
    projs = list_projects()
    print(f'  项目数: {len(projs)}')
    if projs:
        pid = projs[-1]['id']
        print(f'  最后项目: id={pid} name={projs[-1].get("name")}')
        ctx = context(pid)
        print(f'  context: chapters={len(ctx.get("chapters", []))} characters={len(ctx.get("characters", []))}')
