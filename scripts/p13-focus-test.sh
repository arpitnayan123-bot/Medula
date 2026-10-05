#!/bin/bash
# focused: dashboard cross-link + state stability
cd /home/z/my-project
B="agent-browser"
(lsof -t -i:3000 2>/dev/null | xargs -r kill -9) 2>/dev/null
$B close >/dev/null 2>&1
setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &
disown
for i in $(seq 1 40); do sleep 3; code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:3000/api/profile); [ "$code" = "200" ] && break; done
echo "server ready (code=$code)"

$B open "http://localhost:3000/#/home" >/dev/null 2>&1
sleep 5
$B find role button click --name "Sign in" >/dev/null 2>&1
sleep 3
$B find role button click --name "Use demo account — skip the form" >/dev/null 2>&1
sleep 10
echo "1 · url: $($B get url)"

echo "2 · wait for dashboard tiles (cross-link lives under the quick-numbers grid)"
for t in $(seq 1 20); do
  if $B snapshot -c 2>/dev/null | grep -q "open Performance Intelligence"; then echo "   cross-link visible after ~${t}s"; break; fi
  sleep 1
done
$B snapshot -c 2>/dev/null | grep -i "performance intelligence" | head -2

echo "3 · click cross-link"
$B find text "open Performance Intelligence" click 2>&1 | head -2
sleep 3
echo "4 · url: $($B get url)"
$B snapshot -c 2>/dev/null | grep -iE "WHERE AM I|WHAT'S HOLDING" | head -3

echo "5 · reload stability check (hash deep link + session persistence)"
$B reload >/dev/null 2>&1
sleep 6
echo "   url after reload: $($B get url)"
$B snapshot -c 2>/dev/null | grep -iE "PERFORMANCE INTELLIGENCE|Welcome back" | head -2

echo "6 · final errors"
$B errors 2>&1 | head -6
echo "FOCUSED E2E DONE"
