#!/usr/bin/env bash
# Сборка Afterimage Diary из исходников в web/src. Зависимостей нет: нужны только bash, node и python3.
#   dist/afterimage.html     — страница для публикации в Claude (один файл, без <html>/<head>/<body>)
#   dist/standalone.html     — тот же файл как полноценный документ: открывается двойным щелчком
#   server/public/*          — версия для своего сервера: код и стили отдельными файлами (строгая CSP, без inline)
#   server/prompt.gen.mjs    — общий с сервером модуль запросов к ИИ
set -euo pipefail
cd "$(dirname "$0")"
SRC=web/src
mkdir -p dist server/public
js() { echo '(function () {'; echo '"use strict";'; cat $SRC/js/*.js; echo '})();'; }
css() { cat $SRC/styles-base.css $SRC/styles2.css; }
RESET='<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'

js > dist/app.check.js
node --check dist/app.check.js

# 1. страница для Claude
{ cat $SRC/head.html; echo '<style>'; css; echo '</style>'; cat $SRC/body.html; echo '<script>'; cat dist/app.check.js; echo '</script>'; } > dist/afterimage.html
# 2. отдельный файл
{ echo "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">$RESET</head><body>"; cat dist/afterimage.html; echo '</body></html>'; } > dist/standalone.html
# 3. версия для сервера: никакого inline-кода
cp dist/app.check.js server/public/app.js
css > server/public/app.css
{
  echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  grep -v 'claude:viewport' $SRC/head.html
  echo '<link rel="stylesheet" href="/app.css"></head><body>'
  cat $SRC/body.html
  echo '<script src="/app.js" defer></script></body></html>'
} > server/public/index.html
# 4. модуль запросов для сервера: те же функции, что и в браузере
{ echo '// Собрано build.sh из web/src/js — не редактировать вручную.'; cat $SRC/js/01-util.js $SRC/js/02-fonts.js $SRC/js/03a-shared.js; echo 'export { buildBriefPrompt, buildMusicPrompt, buildGeoPrompt, safeUrl, validHex, musicProvider, LAYOUT_KEYS };'; } > server/prompt.gen.mjs
node --check server/prompt.gen.mjs
# 5. тестовая сборка: тот же отдельный файл с открытыми внутренностями (не публикуется)
python3 - <<'PY'
src = open('dist/standalone.html', encoding='utf8').read()
i = src.rindex('})();')
open('dist/test.html', 'w', encoding='utf8').write(src[:i] + open('test/expose.js', encoding='utf8').read() + src[i:])
PY
rm -f dist/app.check.js
echo "ok"; wc -c dist/afterimage.html server/public/app.js server/public/app.css
