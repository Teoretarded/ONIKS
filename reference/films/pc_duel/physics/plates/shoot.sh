#!/bin/sh
# render a plate to out/<name>.png at 2560 x 1440: sh shoot.sh banks
D="$(cd "$(dirname "$0")" && pwd -W)"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1.3333333 --window-size=1920,1080 --virtual-time-budget=20000 \
  --screenshot="$D/out/plate_$1.png" "file:///$D/plate_$1.html" 2>/dev/null
