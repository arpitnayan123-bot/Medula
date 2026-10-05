#!/bin/bash
# PRODUCT 13 — atomic browser E2E (server + browser in one session)
cd /home/z/my-project
B="agent-browser"

echo "════ 1 · boot server ════"
(lsof -t -i:3000 2>/dev/null | xargs -r kill -9) 2>/dev/null
$B close >/dev/null 2>&1
setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
disown
for i in $(seq 1 40); do
  sleep 3
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:3000/api/profile)
  [ "$code" = "200" ] && break
done
echo "server ready after ~$((i*3))s (code=$code)"
[ "$code" != "200" ] && { echo "SERVER FAILED"; exit 1; }

echo "════ 2 · open deep link #/performance (landing gate) ════"
$B open "http://localhost:3000/#/performance" >/dev/null 2>&1
sleep 5
$B find role button click --name "Sign in" >/dev/null 2>&1 || { echo "sign-in btn NOT found"; $B snapshot -i -c | head -10; }
sleep 3
$B find role button click --name "Use demo account — skip the form" >/dev/null 2>&1 || { echo "demo btn NOT found"; $B snapshot -i -c | head -10; }
echo "waiting for app boot + performance fetch…"
sleep 12
$B get url

echo "════ 3 · OVERVIEW tab render check ════"
$B wait --text "holding me back" --timeout 20000 >/dev/null 2>&1 && echo "overview hero: OK" || echo "overview hero text: not found (checking raw)"
$B snapshot -i -c 2>&1 | head -70

mkdir -p docs/screenshots agent-ctx
$B set viewport 1280 900 >/dev/null 2>&1
$B screenshot agent-ctx/p13-overview-desktop.png >/dev/null 2>&1 && echo "shot: overview desktop"

echo "════ 4 · READINESS tab ════"
$B find role tab click --name "Readiness" >/dev/null 2>&1 && echo "tab click OK" || { echo "tab locator failed — snapshotting tabs:"; $B snapshot -i -c | grep -iE "tab|overview|readiness" | head -8; }
sleep 2
$B snapshot -c 2>&1 | grep -iE "methodology|weight|how to move|excluded" | head -8
$B screenshot agent-ctx/p13-readiness.png >/dev/null 2>&1

echo "════ 5 · TRENDS tab ════"
$B find role tab click --name "Trends" >/dev/null 2>&1
sleep 2
$B snapshot -c 2>&1 | grep -iE "improving|declining|too early|steady|rising|slipping" | head -10
$B screenshot agent-ctx/p13-trends.png >/dev/null 2>&1

echo "════ 6 · FOCUS tab ════"
$B find role tab click --name "Focus" >/dev/null 2>&1
sleep 2
$B snapshot -c 2>&1 | grep -iE "weakness intelligence|strength intelligence|exam readiness|priority|act now" | head -10
$B screenshot agent-ctx/p13-focus.png >/dev/null 2>&1

echo "════ 7 · AI ANALYST tab (preset question) ════"
$B find role tab click --name "AI Analyst" >/dev/null 2>&1
sleep 2
$B find role button click --name "What is my weakest subject?" >/dev/null 2>&1 && echo "preset chip clicked" || echo "preset chip NOT found"
sleep 14
$B snapshot -c 2>&1 | grep -iE "grounded|AI unavailable|analyst|disclaimer|not a rank" | head -8
$B screenshot agent-ctx/p13-ai.png >/dev/null 2>&1

echo "════ 8 · hand-off smoke (Overview → focusNow action) ════"
$B find role tab click --name "Overview" >/dev/null 2>&1
sleep 2
$B snapshot -i -c 2>&1 | grep -iE "MCQ|revision|mistake|map|hub" | head -12

echo "════ 9 · mobile 390px ════"
$B set viewport 390 844 >/dev/null 2>&1
sleep 2
$B screenshot agent-ctx/p13-mobile-overview.png >/dev/null 2>&1 && echo "shot: mobile overview"
$B find role tab click --name "Readiness" >/dev/null 2>&1
sleep 1
$B screenshot agent-ctx/p13-mobile-readiness.png >/dev/null 2>&1

echo "════ 10 · console + page errors ════"
$B errors 2>&1 | head -12
$B console 2>&1 | grep -iE "error|failed" | head -8
echo "E2E DONE"
