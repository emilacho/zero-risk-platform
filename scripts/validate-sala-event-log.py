#!/usr/bin/env python3
"""Structural dry-parse validation for sala_event_log migration.

NOT a real SQL parser · structural sanity checks only. The real apply
runs against Supabase prod where Postgres parses the statement.
"""
import re
import sys

with open("supabase/migrations/202606021946_sala_event_log.sql", "r", encoding="utf-8") as f:
    sql = f.read()

checks = {
    "BEGIN matched COMMIT": sql.count("BEGIN;") == sql.count("COMMIT;"),
    "3 ENUM types created": sql.count("CREATE TYPE public.sala_") == 3,
    "sala_event_log table created": "CREATE TABLE IF NOT EXISTS public.sala_event_log" in sql,
    "PRIMARY KEY on event_id": re.search(r"event_id\s+UUID\s+PRIMARY KEY", sql) is not None,
    "UNIQUE on idempotency_key": re.search(r"idempotency_key\s+TEXT\s+NOT NULL\s+UNIQUE", sql) is not None,
    "UNIQUE (stream_id, sequence)": "UNIQUE (stream_id, sequence)" in sql,
    "CHECK gate_type consistency": "sala_event_log_gate_type_consistent CHECK" in sql,
    "RLS ENABLE": "ENABLE ROW LEVEL SECURITY" in sql,
    "REVOKE FROM anon": "REVOKE ALL ON public.sala_event_log FROM anon" in sql,
    "POLICY tenant-scoped": "sala_event_log_tenant_scoped_read" in sql,
    "GRANT service_role": "GRANT SELECT, INSERT ON public.sala_event_log TO service_role" in sql,
    "FK to agent_invocations": "REFERENCES public.agent_invocations(id)" in sql,
    "4+ indexes created": sql.count("CREATE INDEX IF NOT EXISTS") >= 4,
    "BRIN index on occurred_at": "USING BRIN (occurred_at)" in sql,
    "Partial index on causation_id": "WHERE causation_id IS NOT NULL" in sql,
    "COMMENTS for documentation": sql.count("COMMENT ON") >= 5,
}

passes = sum(1 for v in checks.values() if v)
total = len(checks)
print(f"=== STRUCTURAL CHECKS · {passes}/{total} pass ===")
print()
for name, ok in checks.items():
    mark = "OK  " if ok else "FAIL"
    print(f"  [{mark}] {name}")

print()
print("=== ENUM value verification ===")
for enum_name in ("sala_event_type_enum", "sala_step_state_enum", "sala_gate_type_enum"):
    m = re.search(enum_name + r" AS ENUM \(([^)]+)\)", sql, re.DOTALL)
    if m:
        vals = re.findall(r"'([^']+)'", m.group(1))
        print(f"  {enum_name} · {len(vals)} values · {vals}")

print()
print("=== Column count (NOT NULL/NULL declarations) ===")
col_matches = re.findall(
    r"^\s+([a-z_]+)\s+(UUID|TEXT|BIGINT|TIMESTAMPTZ|INT|JSONB|public\.sala\w+)\s+",
    sql,
    re.MULTILINE,
)
print(f"  found {len(col_matches)} column declarations")
for name, _ in col_matches:
    print(f"    - {name}")

if passes == total:
    print()
    print("STRUCTURAL VALIDATION PASS · ready for apply via supabase CLI / psql.")
    sys.exit(0)
else:
    print()
    print(f"STRUCTURAL VALIDATION FAIL · {total - passes} check(s) failed.")
    sys.exit(1)
