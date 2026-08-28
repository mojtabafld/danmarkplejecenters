#!/usr/bin/env bash
#
# Run every objective gate the design kit can prove against this app, and print
# one all-or-nothing verdict.
#
#   ./verify.sh          from apps/plejecenter-kort
#
# What this proves: token consistency, no hardcoded values, no emoji, real
# rendered WCAG 2.2 AA contrast in light AND dark, contrast in every interaction
# state, axe-core ARIA/label/landmark conformance, keyboard operability, WCAG
# 2.5.8 target sizes, no horizontal overflow down to 280px (also at 1.25x root
# font), RTL mirroring for the Persian UI, reduced-motion parity for the
# location pulse, no clipped text or overlapping controls, and the render-based
# anti-slop/taste signals.
#
# What this does NOT prove: that the thing looks good. No script scores taste.
# Look at it, and read the "Verification" section of the README.
set -uo pipefail

# The gates themselves live in the design-system kit, not in this repo. Point
# KIT at a checkout of it:
#
#   KIT=../ux-ui-agent-skills ./verify.sh
#
# Everything else here -- dev, build, preview -- runs without it.
APP="$(cd "$(dirname "$0")" && pwd)"
KIT="${KIT:-$APP/../..}"
if [ ! -f "$KIT/scripts/accuracy_report.mjs" ]; then
  echo "The quality gates live in the design-system kit, which is not in this repo."
  echo "Point KIT at a checkout of it, e.g.:  KIT=../ux-ui-agent-skills ./verify.sh"
  echo "Looked in: $KIT"
  exit 2
fi
cd "$KIT" || exit 2
KIT="$(pwd)"

REL="${APP#"$KIT"/}"
V="$REL/verification"
PAGES=("$V/harness.html" "$V/panel.html" "$V/states.html")

export DS_REQUIRE_BROWSER=1

pass=0; fail=0; failed=()

run() {
  local name="$1"; shift
  if out=$("$@" 2>&1); then
    pass=$((pass + 1)); printf '  ok   %s\n' "$name"
  else
    fail=$((fail + 1)); failed+=("$name"); printf '  FAIL %s\n' "$name"
    printf '%s\n' "$out" | sed 's/^/         /' | tail -12
  fi
}

echo "Rebuilding the gate harness from src/ ..."
(cd "$APP" && node verification/build-harness.mjs) || exit 1
echo

echo "Static source checks"
run "no emoji anywhere in the app"        python3 scripts/check_no_emoji.py "$REL"
run "typecheck (tsc --noEmit)"            npm --prefix "$APP" run --silent typecheck
echo

echo "Rendered accessibility and layout"
for p in "${PAGES[@]}"; do
  n="$(basename "$p" .html)"
  run "WCAG contrast, real render, light  [$n]" node scripts/measure_render.mjs "$p"
  run "WCAG contrast, real render, dark   [$n]" node scripts/measure_render.mjs --dark "$p"
  run "WCAG in default/hover/focus, light [$n]" node scripts/verify_states.mjs "$p"
  run "WCAG in default/hover/focus, dark  [$n]" node scripts/verify_states.mjs --dark "$p"
  run "axe-core WCAG 2.2 A/AA             [$n]" node scripts/axe_audit.mjs "$p"
  run "target size (WCAG 2.5.8)           [$n]" node scripts/verify_target_size.mjs "$p"
done
for p in "${PAGES[@]}"; do
  n="$(basename "$p" .html)"
  run "RTL mirror, no logical-property break [$n]" node scripts/verify_rtl.mjs "$p"
done
run "reduced motion: stopped, nothing lost"  node scripts/verify_reduced_motion.mjs "$V"
run "keyboard: reachable and operable"     node scripts/verify_keyboard.mjs "$V/harness.html"
run "token intent (no blue delete)"        node scripts/lint_intent.mjs "$V/harness.html"
run "no overflow at 280/320/414px"         node scripts/verify_responsive.mjs "$V"
run "no overflow at 280/320/414px @1.25x"  node scripts/verify_responsive.mjs "$V" --scale=1.25
run "no clipped text, no overlapping ctrl" node scripts/verify_overflow.mjs "$V"
echo

echo "Taste signals (heuristic, never proof)"
for p in "${PAGES[@]}"; do
  n="$(basename "$p" .html)"
  run "anti-slop tells                     [$n]" node scripts/slop_tells.mjs "$p"
done
run "type scale / repetition / measure     [harness]" node scripts/taste_audit.mjs "$V/harness.html"
echo

total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo "$pass/$total gates pass."
  echo "Objective correctness only. Taste is not scored by any of this."
  exit 0
fi
echo "$pass/$total gates pass. $fail failed:"
printf '  - %s\n' "${failed[@]}"
exit 1
