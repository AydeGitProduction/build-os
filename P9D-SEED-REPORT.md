# P9D — UX System Refinement + Power Wizard Architecture
## Seed Report

**Date:** 2026-03-31
**Epic ID:** bd036478-a49f-4f3d-8092-53b1348a794d
**Project:** SaaS 4 SaaS (feb25dda-6352-42fa-bac8-f4a7104f7b8c)
**Status:** SEEDED ✅

---

## Summary

| Metric | Value |
|--------|-------|
| Workstreams | 11 (WS1–WS11) |
| Total Tasks | 55 |
| Epic Status | pending → ready for dispatch |
| Phase | P9D |

---

## Workstream Breakdown

| WS | Title | Tasks | Focus |
|----|-------|-------|-------|
| WS1 | Power Wizard Re-Architecture | 7 | Rename, project-aware detection, execution mode |
| WS2 | Phase-Based Wizard System | 6 | phases table, API, PhaseList, switching |
| WS3 | Layout Simplification | 5 | 3-column grid, no overlay, responsive |
| WS4 | Main Panel (Right) | 5 | Tab system: Preview/Tasks/Blueprint real data |
| WS5 | Mini Sidebar Left | 4 | Icon-only collapsible, tooltips, topbar |
| WS6 | Global Sidebar Redesign | 6 | Dark Vercel-style, workspace dropdown, settings fix |
| WS7 | Wizard Entry Logic | 5 | Auto-open on create, Dashboard CTA, phase nav |
| WS8 | Context Persistence | 5 | ProjectContext, URL persistence, reload-safe |
| WS9 | Right Panel Real Data Fixes | 4 | preview_url, task filter fix, blueprint envelope fix |
| WS10 | Transitions & UX Polish | 4 | Fade/slide entry, tab animation, hover states |
| WS11 | Cleanup | 4 | Remove Autopilot remnants, dead code |

---

## Critical Fixes Targeted

1. **FIX-01 AUTOPILOT/IRIS** (WS1-T3, WS1-T4, WS8-T3): IrisWorkspace always showed "New Project" → blueprint detection + execution mode + reload persistence
2. **FIX-02 INTEGRATIONS** (covered in WS6-T2): workspace dropdown + integrations entry point
3. **FIX-03 SETTINGS 404** (WS6-T4): create settings page
4. **FIX-04 TASKS FILTER** (WS4-T3, WS9-T2): show completed tasks in right panel
5. **FIX-05 COST MISMATCH** (WS9 related): cost tracking unification
6. **FIX-06 DOCS EMPTY** (WS9 related): real doc surfacing

---

## Acceptance Criteria

DONE ONLY IF:
- [ ] Power Wizard works with real project (shows SaaS 4 SaaS state)
- [ ] Phases are navigable (at least Phase 1 exists and switches work)
- [ ] Layout is clean (3 columns: mini sidebar | chat | main panel)
- [ ] Sidebar redesigned (dark, Vercel-style)
- [ ] Workspace dropdown exists and works
- [ ] Preview/Tasks/Blueprint all show real data
- [ ] No onboarding reset bug (refresh keeps project state)
- [ ] No broken routes (Settings → page, Integrations → content)
