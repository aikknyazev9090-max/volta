#!/usr/bin/env bash
# Выкладка на Hugging Face Spaces.
# В .env должны быть HF_USER (имя аккаунта) и HF_TOKEN (токен с правом write).
# Space с именем HF_SPACE (по умолчанию volta) создаётся сам при первом запуске.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
HF_USER=$(val HF_USER); HF_TOKEN=$(val HF_TOKEN); HF_SPACE=$(val HF_SPACE); HF_SPACE=${HF_SPACE:-volta}
[ -n "$HF_USER" ] && [ -n "$HF_TOKEN" ] || { echo "Нужны HF_USER и HF_TOKEN в .env"; exit 1; }

API=https://huggingface.co/api
AUTH="Authorization: Bearer $HF_TOKEN"

# создать Space, если его ещё нет (409 — уже существует)
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/repos/create" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"type\":\"space\",\"name\":\"$HF_SPACE\",\"sdk\":\"docker\",\"private\":false}")
case $code in 200|201) echo "Space создан";; 409) echo "Space уже есть";; *) echo "Не удалось создать Space: HTTP $code"; exit 1;; esac

# секреты: токен бота и админы берутся из локального .env, адрес — из имени Space
SUB=$(echo "$HF_USER-$HF_SPACE" | tr 'A-Z_.' 'a-z--')
PUBLIC_URL="https://$SUB.hf.space"
secret() {
  [ -n "$2" ] || return 0
  curl -s -o /dev/null -w "секрет $1: %{http_code}\n" -X POST "$API/spaces/$HF_USER/$HF_SPACE/secrets" -H "$AUTH" \
    -H 'content-type: application/json' -d "{\"key\":\"$1\",\"value\":\"$2\"}"
}
secret BOT_TOKEN "$(val BOT_TOKEN)"
secret ADMIN_IDS "$(val ADMIN_IDS)"
secret PUBLIC_URL "$PUBLIC_URL"
secret TG_API_ROOT "$(val TG_API_ROOT)"

# чистая копия проекта без node_modules, .env и базы
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar --exclude=node_modules --exclude=dist --exclude=.env --exclude=apps/server/data --exclude=.claude --exclude=.git -cf - . | tar -xf - -C "$TMP"
cd "$TMP"
git init -q -b main
git lfs install --local >/dev/null
git lfs track '*.jpg' '*.png' '*.webp' >/dev/null
git add -A
git -c user.name=volta -c user.email=volta@localhost commit -qm "deploy $(date +%F_%H:%M)"
git push -q --force "https://$HF_USER:$HF_TOKEN@huggingface.co/spaces/$HF_USER/$HF_SPACE" main
echo
echo "Готово. Сборка идёт 3–5 минут: https://huggingface.co/spaces/$HF_USER/$HF_SPACE"
echo "Адрес приложения: $PUBLIC_URL"
