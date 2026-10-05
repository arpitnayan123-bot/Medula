#!/bin/bash
# PRODUCT 13 — interaction E2E: hand-offs + dashboard cross-link
cd /home/z/my-project
B="agent-browser"

(lsof -t -i:3000 2>/dev/null | xargs -r kill -9) 2>/dev/null
$B close >/dev/null 2>&1
setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
disown
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:3000/api/profile); [ "$code" = "200" ] && break; done
echo "server ready (code=$code)"; [ "$code" != "200" ] && exit 1

$B open "http://localhost:3000/#/performance" >/dev/null 2>&1
sleep 5
$B find role button click --name "Sign in" >/dev/null 2>&1
sleep 3
$B find role button click --name "Use demo account — skip the form" >/dev/null 2>&1
sleep 12
echo "url after sign-in: $($B get url)"

echo "─── A · focusNow action → Topic Hub hand-off"
$B find role button click --name "Open in Topic Hub" >/dev/null 2>&1
sleep 4
echo "url now: $($B get url)"
$B snapshot -c 2>&1 | grep -iE "TOPIC HUB|hub" | head -4

echo "─── B · back to Performance via nav, then 'See all' → Focus tab"
$B find role button click --name "Performance" >/dev/null 2>&1
sleep 3
$B find role button click --name "See all 10 in Focus" >/dev/null 2>&1
sleep 2
$B snapshot -c 2>&1 | grep -iE "WEAKNESS INTELLIGENCE|STRENGTH INTELLIGENCE|EXAM READINESS" | head -4

echo "─── C · dashboard cross-link"
$B find role button click --name "Home" >/dev/null 2>&1
sleep 5
$B find text "open Performance Intelligence" click >/dev/null 2>&1 && echo "cross-link clicked" || { echo "cross-link locator miss — trying partial"; $B snapshot -i -c 2>&1 | grep -i "performance intelligence" | head -3; }
sleep 3
echo "url now: $($B get url)"
$B snapshot -c 2>&1 | grep -iE "PERFORMANCE INTELLIGENCE|WHERE AM I" | head -3

echo "─── D · AI preset 'Am I ready for a mock test?'"
$B find role tab click --name "AI Analyst" >/dev/null 2>&1
sleep 1
$B find role button click --name "Am I ready for a mock test?" >/dev/null 2>&1
sleep 14
$B snapshot -c 2>&1 | grep -iE "mock|ready|ALYST" | head -6
$B screenshot agent-ctx/p13-ai-mockready.png >/dev/null 2>&1

echo "─── E · errors"
$B errors 2>&1 | head -8
$B console 2>&1 | grep -iE "error|failed|warn" | grep -v "Download the React DevTools" | head -6
echo "INTERACTION E2E DONE"
