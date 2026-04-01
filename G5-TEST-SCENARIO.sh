#!/usr/bin/env bash
# G5-TEST-SCENARIO.sh — Block G5: Governance Memory Layer Test Scenarios
# Run AFTER applying migrations/20260401000030_g5_governance_memory.sql
# via Supabase SQL Editor.
#
# Prerequisites:
#   - Tables exist: task_events, handoff_events, settings_changes, release_gate_checks, manual_override_log
#   - BUILDOS_SECRET env var set (or use hardcoded default)
#   - BASE_URL env var set (or use default)
#
# Usage:
#   bash G5-TEST-SCENARIO.sh

BASE_URL="${BASE_URL:-https://build-os.vercel.app}"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dnBveXhkeGVkY3VndGRybHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY5MDQ1MiwiZXhwIjoyMDkwMjY2NDUyfQ.VF0cT6AhlaZyi8OOOU_0OuiL1jv-DcKrbLLo6WGIy8Q}"
SUPA_URL="https://zyvpoyxdxedcugtdrluc.supabase.co"

PASS=0
FAIL=0

check() {
  local name="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    echo "  ✓ PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

supa_get() {
  # Returns response body (never exits non-zero on HTTP errors)
  curl -s "$SUPA_URL/rest/v1/$1" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY"
}

supa_post() {
  local path="$1"
  local body="$2"
  curl -s -X POST "$SUPA_URL/rest/v1/$path" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$body"
}

echo "=== G5 Test Scenarios — Governance Memory Layer ==="
echo "Supabase: $SUPA_URL"
echo ""

# ─── Pre-check: tables exist ─────────────────────────────────────────────────
echo "=== Pre-check: table existence ==="
ALL_TABLES_OK=true
for table in task_events handoff_events settings_changes release_gate_checks manual_override_log; do
  resp=$(supa_get "$table?limit=1")
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'code' in d and 'PGRST' in d['code'] else 1)" 2>/dev/null; then
    code=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code','?'))" 2>/dev/null)
    echo "  ✗ $table: NOT FOUND ($code) — apply SQL migration first"
    FAIL=$((FAIL + 1))
    ALL_TABLES_OK=false
  else
    echo "  ✓ $table: accessible"
    PASS=$((PASS + 1))
  fi
done

if [ "$ALL_TABLES_OK" = "false" ]; then
  echo ""
  echo "  ❌ Tables missing — cannot proceed."
  echo "  Apply migrations/20260401000030_g5_governance_memory.sql via Supabase SQL Editor,"
  echo "  then re-run this script."
  echo ""
  echo "=== Test Summary ==="
  echo "  PASS: $PASS / $((PASS + FAIL))"
  echo "  FAIL: $FAIL / $((PASS + FAIL))"
  exit 1
fi
echo ""

# ─── Scenario A: QA failure leaves a durable trace ───────────────────────────
echo "=== Scenario A: QA failure leaves a durable trace ==="

DUMMY_TASK_ID_A="00000000-0000-0000-0000-000000000a01"

echo "  A1: POST task_events (qa_verdict_fail) via Supabase REST..."
A1=$(supa_post "task_events" "{
  \"task_id\": \"$DUMMY_TASK_ID_A\",
  \"event_type\": \"qa_verdict_fail\",
  \"actor_type\": \"agent\",
  \"actor_id\": \"qa_security_auditor\",
  \"details\": {\"verdict\": \"FAIL\", \"score\": 25, \"compilation_passed\": false}
}")
echo "  Response: $A1"
A1_ID=$(echo "$A1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
check "A1: POST task_events qa_verdict_fail succeeded" "$([ -n "$A1_ID" ] && echo true || echo false)"

echo "  A2: GET task_events?event_type=qa_verdict_fail&task_id=..."
A2=$(supa_get "task_events?event_type=eq.qa_verdict_fail&task_id=eq.$DUMMY_TASK_ID_A")
echo "  Response: $A2"
A2_COUNT=$(echo "$A2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
check "A2: GET returns qa_verdict_fail record" "$([ "${A2_COUNT:-0}" -ge 1 ] && echo true || echo false)"

echo ""

# ─── Scenario B: Settings change is logged with reason ───────────────────────
echo "=== Scenario B: Settings change is logged with reason ==="

echo "  B1: POST settings_changes via Supabase REST..."
B1=$(supa_post "settings_changes" '{
  "setting_area": "dispatch",
  "setting_key": "max_retries_g5_test",
  "previous_value": "3",
  "new_value": "5",
  "reason": "Load spike - increasing retries for high-volume period",
  "changed_by": "g5-test-scenario"
}')
echo "  Response: $B1"
B1_ID=$(echo "$B1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
check "B1: POST settings_changes succeeded" "$([ -n "$B1_ID" ] && echo true || echo false)"

echo "  B2: GET settings_changes?setting_key=max_retries_g5_test..."
B2=$(supa_get "settings_changes?setting_key=eq.max_retries_g5_test")
echo "  Response: $B2"
B2_COUNT=$(echo "$B2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
B2_REASON=$(echo "$B2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('reason','') if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
check "B2: GET returns settings_changes record" "$([ "${B2_COUNT:-0}" -ge 1 ] && echo true || echo false)"
check "B2: reason field preserved correctly" "$(echo "$B2_REASON" | grep -q 'Load spike' && echo true || echo false)"

echo ""

# ─── Scenario C: Manual override and release gate are traceable ───────────────
echo "=== Scenario C: Manual override and release gate are traceable ==="

DUMMY_TASK_ID_C="00000000-0000-0000-0000-000000000c01"

echo "  C1: POST manual_override_log via Supabase REST..."
C1=$(supa_post "manual_override_log" "{
  \"override_type\": \"force_complete\",
  \"target_entity_type\": \"task\",
  \"target_entity_id\": \"$DUMMY_TASK_ID_C\",
  \"reason\": \"Manual rescue after 3 failed agent retries - task verified correct by architect\",
  \"performed_by\": \"architect\"
}")
echo "  Response: $C1"
C1_ID=$(echo "$C1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
check "C1: POST manual_override_log succeeded" "$([ -n "$C1_ID" ] && echo true || echo false)"

echo "  C2: POST release_gate_checks via Supabase REST..."
C2=$(supa_post "release_gate_checks" '{
  "gate_name": "pre-deploy-g5-test",
  "gate_status": "passed",
  "evidence_summary": "All 4 checks passed: QA gate, incident count, build status, migration applied",
  "checked_by": "g5-test-scenario"
}')
echo "  Response: $C2"
C2_ID=$(echo "$C2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
check "C2: POST release_gate_checks succeeded" "$([ -n "$C2_ID" ] && echo true || echo false)"

echo "  C3: GET manual_override_log?override_type=force_complete&target_entity_id=..."
C3=$(supa_get "manual_override_log?override_type=eq.force_complete&target_entity_id=eq.$DUMMY_TASK_ID_C")
C3_COUNT=$(echo "$C3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
check "C3: GET manual_override_log returns record" "$([ "${C3_COUNT:-0}" -ge 1 ] && echo true || echo false)"

echo "  C4: GET release_gate_checks?gate_name=pre-deploy-g5-test&gate_status=passed..."
C4=$(supa_get "release_gate_checks?gate_name=eq.pre-deploy-g5-test&gate_status=eq.passed")
C4_COUNT=$(echo "$C4" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
check "C4: GET release_gate_checks returns passed record" "$([ "${C4_COUNT:-0}" -ge 1 ] && echo true || echo false)"

echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo "=== Test Summary ==="
echo "  PASS: $PASS / $TOTAL"
echo "  FAIL: $FAIL / $TOTAL"
if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "  ✅ All G5 scenarios PASSED — Governance Memory Layer is operational"
else
  echo ""
  echo "  ❌ $FAIL scenario(s) FAILED — check output above"
fi
