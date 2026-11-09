# Reflex Lab

Year 7-8 "Testing and supporting claims" game. Students test claims about their own reaction time.
Spec: `docs/SPEC.md` (v2). Measurement and all controls are semantic HTML; the 3D scene (`js/scene/`) is a backdrop and reward only.

Run: `python3 -m http.server 8472` then open http://localhost:8472/ (add `?teacher=1` for the teacher panel, or long-press the logo).
Tests: `npm test` (node --test).

Files: `js/trial-engine.js` (timing, classification, plan), `js/stats.js` (median / pair score / labels), `js/claims.js`, `js/records.js` (TSV/CSV/class line), `js/charts.js` (SVG plots), `js/app.js` (screens, XP, storage), `js/scene/stub.js` (2D fallback).
Times are browser-estimated, not nerve speed. Fonts are vendored in `fonts/` (TTF).
