#!/usr/bin/env python3
"""sf2 — CLI for StoryForge2 backend API (http://localhost:8765).

Usage:
  python sf2.py <table> list [--project ID]
  python sf2.py <table> get <id>
  python sf2.py <table> create <JSON>
  python sf2.py <table> update <id> <JSON>
  python sf2.py <table> delete <id>
  python sf2.py health

Examples:
  python sf2.py projects list
  python sf2.py characters list --project 1
  python sf2.py projects create '{"name":"test","genre":"other","status":"drafting","targetWordCount":100000,"createdAt":1752969600000,"updatedAt":1752969600000}'
"""

import sys, json, argparse, urllib.request, urllib.error

BASE = 'http://localhost:8765/api'


def _req(method, table, *path_parts, body=None, params=None):
    url = f'{BASE}/{table}'
    for p in path_parts:
        url += f'/{p}'
    if params:
        qs = '&'.join(f'{k}={v}' for k, v in params.items())
        url += f'?{qs}'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        tb = e.read().decode() if e.fp else str(e)
        print(f'ERROR {e.code}: {tb}', file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f'ERROR: Cannot connect to {BASE} — is the backend running? ({e.reason})', file=sys.stderr)
        sys.exit(1)


def cmd_list(table, project_id):
    params = {'projectId': project_id} if project_id else None
    rows = _req('GET', table, params=params)
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))


def cmd_get(table, id_):
    row = _req('GET', table, str(id_))
    print(json.dumps(row, ensure_ascii=False, indent=2))


def cmd_create(table, body_json):
    body = json.loads(body_json)
    result = _req('POST', table, body=body)
    print(json.dumps(result, ensure_ascii=False))


def cmd_update(table, id_, body_json):
    body = json.loads(body_json)
    result = _req('PUT', table, str(id_), body=body)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_delete(table, id_):
    result = _req('DELETE', table, str(id_))
    print(json.dumps(result, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description='StoryForge2 CLI')
    parser.add_argument('table', help='Table name (projects, characters, chapters, etc.)')
    parser.add_argument('action', nargs='?', default='list',
                        choices=['list', 'get', 'create', 'update', 'delete', 'health'])
    parser.add_argument('arg1', nargs='?', help='ID for get/update/delete, or JSON body for create')
    parser.add_argument('arg2', nargs='?', help='JSON body for update')
    parser.add_argument('--project', type=int, help='Filter by projectId')

    args = parser.parse_args()

    if args.table == 'health':
        r = _req('GET', 'health')
        print(json.dumps(r, ensure_ascii=False))
        return

    if args.action == 'list':
        cmd_list(args.table, args.project)
    elif args.action == 'get':
        if not args.arg1:
            print('ERROR: get requires an ID', file=sys.stderr); sys.exit(1)
        cmd_get(args.table, args.arg1)
    elif args.action == 'create':
        if not args.arg1:
            print('ERROR: create requires a JSON body', file=sys.stderr); sys.exit(1)
        cmd_create(args.table, args.arg1)
    elif args.action == 'update':
        if not args.arg1 or not args.arg2:
            print('ERROR: update requires ID and JSON body', file=sys.stderr); sys.exit(1)
        cmd_update(args.table, args.arg1, args.arg2)
    elif args.action == 'delete':
        if not args.arg1:
            print('ERROR: delete requires an ID', file=sys.stderr); sys.exit(1)
        cmd_delete(args.table, args.arg1)


if __name__ == '__main__':
    main()
