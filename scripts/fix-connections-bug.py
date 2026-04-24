#!/usr/bin/env python3
"""
Zero Risk — Fix "connections use node IDs instead of names" bug in workflow JSONs.

Scans all workflow JSONs in n8n-workflows/proposed-sesion27b/, detects:
  - Top-level connection keys that are node IDs (not names)
  - Inner edge refs {"node": "<id>"} that are node IDs

Rewrites both to use node NAMES (what n8n requires).

Usage:
  python scripts/fix-connections-bug.py              # dry-run
  python scripts/fix-connections-bug.py --apply      # write to disk
"""
import json
import sys
import glob
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'n8n-workflows', 'proposed-sesion27b')
APPLY = '--apply' in sys.argv

print(f'📂 Scanning {ROOT}\n')

fixed, skipped, corrupt = 0, 0, 0
for f in sorted(glob.glob(os.path.join(ROOT, '*', '*.json'))):
    rel = os.path.relpath(f, ROOT)
    if 'meta.json' in rel or 'LIVE' in rel:
        continue
    try:
        with open(f, 'r', encoding='utf-8') as fp:
            wf = json.load(fp)
    except Exception as e:
        print(f'  ⚠️  {rel}: CORRUPT — {e}')
        corrupt += 1
        continue

    nodes = wf.get('nodes', [])
    id_to_name = {n['id']: n['name'] for n in nodes if n.get('id')}
    names = {n['name'] for n in nodes}
    connections = wf.get('connections', {})

    # Count issues
    top_key_ids = sum(1 for k in connections if k in id_to_name and k not in names)
    inner_ids = 0

    new_connections = {}
    for key, value in connections.items():
        new_key = id_to_name.get(key, key) if key not in names else key
        new_value = {}
        for output_type, branches in (value or {}).items():
            new_branches = []
            for branch in (branches or []):
                new_branch = []
                for edge in (branch or []):
                    if isinstance(edge, dict) and edge.get('node'):
                        n = edge['node']
                        if n in id_to_name and n not in names:
                            inner_ids += 1
                            new_edge = dict(edge)
                            new_edge['node'] = id_to_name[n]
                            new_branch.append(new_edge)
                        else:
                            new_branch.append(edge)
                    else:
                        new_branch.append(edge)
                new_branches.append(new_branch)
            new_value[output_type] = new_branches
        new_connections[new_key] = new_value

    if top_key_ids == 0 and inner_ids == 0:
        skipped += 1
        continue

    wf['connections'] = new_connections
    print(f'  🔧 {rel} — {top_key_ids} top-keys + {inner_ids} inner refs')
    fixed += 1

    if APPLY:
        with open(f, 'w', encoding='utf-8') as fp:
            json.dump(wf, fp, indent=2, ensure_ascii=False)

print('')
print('━' * 80)
print(f'📊 {fixed} need fix  ⊘ {skipped} already ok  ⚠️  {corrupt} corrupt')
if not APPLY:
    print('\nDry-run — re-run with --apply to persist.')
else:
    print(f'\n✅ Wrote {fixed} files.')
