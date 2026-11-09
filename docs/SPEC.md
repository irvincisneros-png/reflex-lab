# Reflex Lab — Spec v2 (after Codex adversarial review, 2026-11-09)

Reflex Lab is a Year 7–8 game for the lesson "Testing and supporting claims". Students test claims about their own reaction time on school Chromebooks or phones (375px). The 3D world is a polished, realistic "neuroscience lab", but **measurement and every control live in semantic HTML**. The 3D layer is a backdrop and a reward, never the apparatus.

## Key decisions (taken from the review)
1. **Honest timing.** We report a "browser-estimated reaction time" and never claim to measure photon onset or nerve speed. The help text explains why.
2. **Identical apparatus across conditions.** During any timed block, the canvas is FROZEN: `scene.setMode('frozen')` renders one last frame and then stops the render loop. The cue is an opaque full-screen DOM overlay (`#cue`). Stimulus time is the `rAF` timestamp *after* the frame where `#cue` gets its GO class. That is a double-rAF: set the class, then on the next rAF the paint is committed and we record `performance.now()`. Response time is `event.timeStamp`. Distractor decoys are DOM/CSS elements in the overlay layer, so both conditions have no WebGL work. Every trial records frame-interval diagnostics (rAF delta during the foreperiod). On results, a run is flagged "Technical warning" if condition p95 rAF delta differs by more than 4 ms, or if the page was hidden during the run.
3. **Colour-blind-safe cues.**
   - WAIT: dark slate background, hollow ring and the word "WAIT…".
   - GO: near-white/bright-mint background with a big filled circle and "GO!". This is a huge luminance jump, so the cue never depends on red vs green.
   - Single steady transition, no flashing, no bloom bursts while timing.
4. **Balanced design.**
   - Every comparison starts with 5 unrecorded warm-up trials.
   - The default is 10 recorded trials per condition in blocks of 5, in ABBA order. The teacher setting allows 6/10/14, which stays even for ABBA.
   - The "practice" claim is labelled a before/after study with order effects, and it runs as its own activity.
   - There is no "repeat until you like it". Repeat starts a *new run* (replication) and keeps the earlier run.
5. **All attempts kept.**
   - Every attempt is logged with one of these classes: `ok`, `falseStart` (tap before GO), `fast` (<100 ms, "suspected anticipation"), `slow` (>1500 ms, kept), `miss` (no response in 2500 ms), `commission` (tap on a no-go), `correctWithhold` or `interrupted` (page hidden).
   - False starts, fast and miss attempts are re-run, up to 3 extra per slot, then the slot stays missing. The re-runs are shown, never hidden.
   - Analysis uses `ok` and `slow` attempts only.
6. **Evidence summary, not an oracle.** stats.js computes the median per condition, the mean, n, the difference of medians, and the **"pair score"**: the % of all (A,B) pairs in which B was slower. The 2D dot plot (every trial) and a trial-order plot are the primary results view. The labels are:
   - **Clear difference:** n≥6 each, |median diff| ≥ 20 ms, and pair score ≥ 75% or ≤ 25%.
   - **Unclear:** anything in between.
   - **No clear difference:** pair score 40–60% and |median diff| < 20 ms.
   - **Technical warning:** overrides the others, with the text "results may reflect the device, not you".
   Claim and prediction are reported separately: "Your observations are consistent with / not consistent with / inconclusive about the claim" and "Your prediction matched / did not match what you observed". The student must then write a one-sentence justification (with sentence starters) before the badge is awarded.
7. **Claims (redefined).**
   - `hand`: dominant vs non-dominant hand. The input method is fixed (touch/click/key), chosen once at setup.
   - `sound`: light vs sound. It requires a headphones check and the teacher setting "audio allowed". The beep is a 1 kHz sine with a 5 ms linear attack, scheduled 100 ms ahead. Its onset maps to performance time via `getOutputTimestamp()` as `perfTime + 1000*(scheduled - contextTime)`. If the timestamp is invalid (0), the run is blocked with a message. It is labelled as comparing "these device-mediated tasks".
   - `distract`: calm vs DOM decoys. These are 6 soft grey/blue/orange shapes drifting slowly, opacity-only fades ≥ 1 s, no flashes.
   - `multitask`: single task vs silently counting backwards by 3 from a shown start (120–199). At the end of each B block the student types the number reached, and an implausible answer is noted.
   - `decide`: simple vs go/no-go. Targets are a filled ★ star and non-targets are ■ ◆ ▲ shapes in the same colour. 70% go, a 900 ms response window, and commission and omission counts are reported beside the times. No colour-word task.
   - `practice`: a before/after block (10 trials, 30 practice, 10 trials). It is clearly flagged as having unresolved order/fatigue effects.
   - Custom claims are teacher-enabled only. The student picks from approved manipulations (posture, eyes-glasses on/off, sitting/standing, time of day) and must state controls.
8. **Planning gate.** Before the run, the student states the claim, independent variable, dependent variable (pre-filled) and two controlled variables (pick-from-list plus own), and makes a prediction (not scored).
9. **Gamification that rewards science, not speed.** The "Investigation" mode is the default. XP is earned for complete records, a prediction made, fair-test answers, a justification written, replication and honest reporting.
   - Badges: Clean Record (all attempts logged with no interruption), Fair Tester, Sceptic ("inconsistent with claim", which is celebrated), Replicator, Pair Scientist (class paired-difference exported), Full Lab (all 6 claims).
   - A separate "Arcade warm-up" mode shows a personal best only, with no rankings. Every speed number carries "speed ≠ smartness".
   - Rank titles across the lab: Intern → Lab Tech → Researcher → Principal Investigator. The 3D lab visibly upgrades with rank (more equipment lit up, holo-displays), which is the 3D reward loop.
10. **Neural replay**, optional after a run. It is a high-detail 3D illustration of a *voluntary* reaction (eye/ear → cortex → motor cortex → spinal cord → hand muscle), with fixed illustrative timing and the label "Simplified illustration — not a measurement of your nerves. A reflex uses a shorter path through the spinal cord." There is a toggle to compare it with a reflex arc.
11. **Records.** Copy (TSV) and CSV export every attempt, with these columns: runId (random), claim, condition, block, slot, attemptNo, class, rt_ms, inputType, stimType, rafP95, hidden, appVersion and renderer. A "Class summary line" gives one row of median A, median B and the paired difference, for pooling on the worksheet. There is a printable results card (print CSS) and a "Reset device" button for shared Chromebooks.
12. **Accessibility.**
   - All navigation is HTML buttons with visible focus and AA contrast.
   - Results stack at ≤ 600px and reflow at 320px.
   - Settings: still mode (no camera drift, pulsing or decoy motion, replay off), reduced motion respected, a 2D-only toggle and large text.
   - Response target: the whole cue overlay. Ignore key repeat, extra pointers and Skip/menu buttons. Require release before re-arm.
13. **Classroom.**
   - Default visual-only (quiet). Audio claims need headphones.
   - Counting is silent.
   - A teacher setup panel (`?teacher=1`, or a long-press on the logo) sets trials per condition, audio allowed, custom claims and still mode, saved to localStorage.
   - Offline: no runtime third-party requests. Fonts are vendored or fall back to the system fonts.

## Module map and interface contract
```
index.html            HTML shell: <canvas id="scene">, <main id="ui"> screens, <div id="cue"> overlay
css/style.css         UI styles (Bubblegum Sans titles, Mulish body, vendored in /fonts or system fallback)
js/app.js             screen state machine, settings, XP/badges, storage (try/catch)
js/trial-engine.js    runs blocks, timing, attempt classification, diagnostics (no DOM besides #cue)
js/stats.js           pure: median, mean, pairScore, summarise(run) -> labels; tested
js/claims.js          claim definitions (rewrite to v2)
js/records.js         TSV/CSV/class line/print; tested
js/scene/index.js     3D layer — default export createScene(canvas, opts) returning the API below
js/scene/*            3D modules, vendor/three/ (three r170 ESM, addons), assets/tex/
tests/*.test.js       node --test tests/*.test.js
```
Scene API (the app must work if `createScene` throws: 2D mode):
```
scene.setMode('hub'|'planning'|'frozen'|'replay'|'results'|'off')
scene.setRank(0..3)           // lab upgrade level
scene.setQuality('low'|'mid'|'high')  // auto-chosen once at boot after warm-up, user can override
scene.setStill(bool)          // still mode
scene.playReplay({stim:'visual'|'audio', compareReflex:bool}) -> Promise (resolves when done/skipped)
scene.celebrate(kind)         // non-timed moments only: 'badge'|'rank'
scene.dispose()
scene.on('contextlost', fn)
```

## 3D visual bar
Realistic, product-render quality, not a primitive or toy look.
- **Hub:** a dim lab with PBR materials (brushed metal, frosted glass, rubber, screens) and PMREM RoomEnvironment lighting plus warm/cool area-like lights. A central holo-table shows the claim being planned as a floating 3D holographic model, e.g. a hand, an ear with sound waves, a star target. There is subtle dust motes and volumetric-looking light shafts (cheap billboard planes), slow camera drift, and bloom only on emissive screens. The rank upgrade turns on equipment.
- **Replay:** a high-detail translucent brain (sculpted from deformed noise-displaced geometry with gyri via normal map), eye, spinal cord and arm nerve as a tube along a curve. An action-potential glow travels the path with depth-of-field focus following the pulse.
- **Quality tiers:**
  - low: pixelRatio 1, no bloom, no transmission, cheap materials.
  - mid: bloom at half resolution.
  - high: + SMAA + bokeh in replay only.
  The tier is frozen once chosen. The scene is never rendered during timing.
