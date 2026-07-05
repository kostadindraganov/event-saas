# V1 инфраструктура: Hostinger VPS + Neon + Cloudflare Images + Resend

Приложението (latest Next.js, standalone в Docker) се хоства на Hostinger VPS зад Cloudflare CDN — не на Vercel, въпреки че стекът е Vercel-native. Базата е Neon Postgres (EU) с Drizzle през `neon-serverless` WebSocket Pool driver (HTTP driver-ът няма интерактивни транзакции, а booking/абонаментните операции ги изискват). Снимките са в Cloudflare Images (direct creator upload, variants); видеата са само YouTube embed линкове. Транзакционните email-и минават през Resend. Периодичните задачи са системен crontab на VPS-а към защитени вътрешни endpoints (без Vercel Cron).

Защо VPS вместо Vercel: контрол върху разходите при €1/месец Standard план и очакван ръст (100k+ потребители); цената е DevOps работа — Docker deploy pipeline, мониторинг и бекъп стратегия се поемат от нас.

Решено в grilling сесия на 2026-07-06.
