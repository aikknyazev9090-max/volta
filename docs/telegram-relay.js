// Пересыльщик запросов к Telegram Bot API для Cloudflare Workers (бесплатно).
// Нужен, только если хостинг не пускает к api.telegram.org.
// Cloudflare → Workers & Pages → Create → Hello World → вставить этот код → Deploy.
// Адрес воркера (https://….workers.dev) записать в секрет TG_API_ROOT.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // пропускаем только запросы бота, остальное отклоняем
    if (!/^\/(file\/)?bot\d+:[\w-]+\//.test(url.pathname)) return new Response('not found', { status: 404 });
    const target = 'https://api.telegram.org' + url.pathname + url.search;
    return fetch(target, { method: request.method, headers: request.headers, body: request.body });
  },
};
