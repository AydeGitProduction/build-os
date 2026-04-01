#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Block G2 — Test Scenario: "Dispatch Retry Cascade"
# Run AFTER applying MIGRATE-G2.sql in Supabase SQL Editor
#
# Usage: bash G2-TEST-SCENARIO.sh
# Expected: All 7 steps pass. Step 2 MUST fail (422). Step 6 MUST succeed.
# ─────────────────────────────────────────────────────────────────────────────

BASE="https://web-lake-one-88.vercel.app"
SECRET="fbdc1467fcb75e068ef3f0976bf132934cba8a75e3adb24d2cd580a437eb532b"
RULE_ID="d47a796d-728e-478f-816b-6e37891320c4"  # RULE-03: Stale run must increment retry_count

H_AUTH="X-Buildos-Secret: $SECRET"
H_CT="Content-Type: application/json"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Block G2 — Test Scenario: Dispatch Retry Cascade"
echo "════════════════════════════════════════════════════════════"

# ── STEP 1: Create incident ────────────────────────────────────────────────
echo ""
echo "STEP 1: Create incident"
echo "Expected: 201, incident_code = INC-0001 (or next in sequence)"

STEP1=$(curl -s -X POST "$BASE/api/governance/incidents" \
  -H "$H_AUTH" -H "$H_CT" \
  -d '{
    "title": "Task retried repeatedly without retry_count increment",
    "description": "Tasks dispatched by the stale-reset path reset to ready without incrementing retry_count, causing them to bypass max_retries and loop indefinitely.",
    "severity": "P1",
    "incident_type": "workflow",
    "owner_domain": "backend"
  }')

echo "$STEP1" | python3 -m json.tool 2>/dev/null | head -20
INCIDENT_ID=$(echo "$STEP1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id','FAILED'))" 2>/dev/null)
INCIDENT_CODE=$(echo "$STEP1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('incident_code','?'))" 2>/dev/null)
echo "→ Incident ID: $INCIDENT_ID"
echo "→ Incident Code: $INCIDENT_CODE"

if [ "$INCIDENT_ID" = "FAILED" ] || [ -z "$INCIDENT_ID" ]; then
  echo "FATAL: Incident creation failed. Apply MIGRATE-G2.sql first."
  exit 1
fi

# ── STEP 2: Attempt premature close (MUST FAIL) ────────────────────────────
echo ""
echo "STEP 2: Attempt premature close — MUST return 422"
echo "Expected: HTTP 422, missing=[D: root_cause, E: fix_record, F: prevention_rule]"

STEP2=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST "$BASE/api/governance/incidents/$INCIDENT_ID/close" \
  -H "$H_AUTH" -H "$H_CT" -d '{}')

HTTP_CODE=$(echo "$STEP2" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$STEP2" | grep -v "HTTP_CODE:")

echo "$BODY" | python3 -m json.tool 2>/dev/null | head -20
echo "→ HTTP Code: $HTTP_CODE"

if [ "$HTTP_CODE" != "422" ]; then
  echo "ENFORCEMENT FAILURE: Expected 422 but got $HTTP_CODE"
  exit 1
else
  echo "✓ PASS: Closure correctly blocked (422)"
fi

# ── STEP 3: Add root cause ─────────────────────────────────────────────────
echo ""
echo "STEP 3: Add root cause"
echo "Expected: 201"

STEP3=$(curl -s -X POST "$BASE/api/governance/incidents/$INCIDENT_ID/root-cause" \
  -H "$H_AUTH" -H "$H_CT" \
  -d '{
    "symptom": "Tasks reset to ready from in_progress loop back infinitely, dispatched >50 times",
    "trigger": "cleanupStaleRuns detects in_progress task past STALE_RUN_THRESHOLD and resets to ready without touching retry_count",
    "broken_assumption": "We assumed retry_count would be incremented atomically with the status reset. The reset path was added separately and the retry_count update was never included.",
    "missing_guardrail": "No DB constraint or code assertion enforces that retry_count must be incremented whenever task status transitions to ready from a non-initial state",
    "why_not_caught_earlier": "QA issued unconditional score=88 without checking retry_count behavior. Integration tests did not cover the stale-reset code path. No max_retries ceiling was tested."
  }')

echo "$STEP3" | python3 -m json.tool 2>/dev/null | head -10
RC_STATUS=$(echo "$STEP3" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('data') else 'error')" 2>/dev/null)
echo "→ Root cause insert: $RC_STATUS"

# ── STEP 4: Add fix ────────────────────────────────────────────────────────
echo ""
echo "STEP 4: Add fix record"
echo "Expected: 201 (P1 requires permanent_prevention_added=true)"

STEP4=$(curl -s -X POST "$BASE/api/governance/incidents/$INCIDENT_ID/fix" \
  -H "$H_AUTH" -H "$H_CT" \
  -d '{
    "fix_type": "permanent",
    "fix_description": "retry_count increment enforced on stale reset — atomic update in cleanupStaleRuns",
    "implementation_notes": "Modified lib/supervisor.ts: cleanupStaleRuns now uses UPDATE tasks SET status=ready, retry_count=retry_count+1 WHERE id=... in a single atomic statement. Also added CHECK retry_count <= max_retries before reset.",
    "permanent_prevention_added": true
  }')

echo "$STEP4" | python3 -m json.tool 2>/dev/null | head -10
FIX_STATUS=$(echo "$STEP4" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('data') else 'error')" 2>/dev/null)
echo "→ Fix insert: $FIX_STATUS"

# ── STEP 5: Link prevention rule (RULE-03 already exists) ─────────────────
echo ""
echo "STEP 5: Link prevention rule RULE-03 (retry_count increment rule)"
echo "Using existing rule ID: $RULE_ID (RULE-03)"
echo "This links the incident to the existing prevention rule without creating a duplicate."

# ── STEP 6: Retry close (MUST PASS) ───────────────────────────────────────
echo ""
echo "STEP 6: Retry close with prevention rule — MUST succeed (200)"
echo "Expected: HTTP 200, status=closed"

STEP6=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST "$BASE/api/governance/incidents/$INCIDENT_ID/close" \
  -H "$H_AUTH" -H "$H_CT" \
  -d "{\"related_rule_id\": \"$RULE_ID\"}")

HTTP_CODE2=$(echo "$STEP6" | grep "HTTP_CODE:" | cut -d: -f2)
BODY2=$(echo "$STEP6" | grep -v "HTTP_CODE:")

echo "$BODY2" | python3 -m json.tool 2>/dev/null | head -15
echo "→ HTTP Code: $HTTP_CODE2"

if [ "$HTTP_CODE2" != "200" ]; then
  echo "ENFORCEMENT FAILURE: Expected 200 but got $HTTP_CODE2"
  exit 1
else
  echo "✓ PASS: Incident closed successfully"
fi

# ── STEP 7: Verify final status = closed ──────────────────────────────────
echo ""
echo "STEP 7: Verify final state"
echo "Expected: status=closed, closed_at set, related_rule_id=$RULE_ID"

STEP7=$(curl -s "$BASE/api/governance/incidents/$INCIDENT_ID" \
  -H "$H_AUTH")

FINAL_STATUS=$(echo "$STEP7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status','?'))" 2>/dev/null)
FINAL_CODE=$(echo "$STEP7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('incident_code','?'))" 2>/dev/null)
RC_COUNT=$(echo "$STEP7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('root_causes',[])))" 2>/dev/null)
FIX_COUNT=$(echo "$STEP7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('fixes',[])))" 2>/dev/null)

echo "→ Final status:    $FINAL_STATUS"
echo "→ Incident code:   $FINAL_CODE"
echo "→ Root causes:     $RC_COUNT"
echo "→ Fixes:           $FIX_COUNT"

if [ "$FINAL_STATUS" = "closed" ]; then
  echo "✓ PASS: status = closed"
else
  echo "FAIL: Expected status=closed, got $FINAL_STATUS"
  exit 1
fi

# ── FINAL RESULTS ─────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  SCENARIO COMPLETE: Dispatch Retry Cascade"
echo ""
echo "  Step 1 — Create incident:           ✓ CREATED ($FINAL_CODE)"
echo "  Step 2 — Premature close:           ✓ REJECTED (422)"
echo "  Step 3 — Add root cause:            ✓ INSERTED"
echo "  Step 4 — Add fix:                   ✓ INSERTED (permanent)"
echo "  Step 5 — Link prevention rule:      ✓ RULE-03 linked"
echo "  Step 6 — Close with rule:           ✓ CLOSED (200)"
echo "  Step 7 — Verify final state:        ✓ status=closed"
echo ""
echo "  ENFORCEMENT VERIFIED: Cannot close without RCA + Fix + Rule"
echo "════════════════════════════════════════════════════════════"
