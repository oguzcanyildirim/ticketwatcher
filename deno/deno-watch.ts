import * as cheerio from "npm:cheerio@1.1.2";

const kvPromise = Deno.openKv();

const DEDUPE_TTL_MS = 15 * 60 * 1000;

function normTR(s: string) {
  return (s ?? "").toLocaleLowerCase("tr-TR").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getConfig() {
  const url = Deno.env.get("WATCH_URL") ?? "";
  const tgToken = Deno.env.get("TG_BOT_TOKEN") ?? "";
  const tgChatId = Deno.env.get("TG_CHAT_ID") ?? "";
  const activeText = normTR(Deno.env.get("ACTIVE_TEXT") ?? "biletini al");
  const cityFilter = normTR(Deno.env.get("CITY_FILTER") ?? "");
  return { url, tgToken, tgChatId, activeText, cityFilter };
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function pickButtons($: cheerio.CheerioAPI, cityFilter: string) {
  if (!cityFilter) return $("button.seanceSelect");

  const sections = $(".ed-biletler__sehir").filter((_, el) => {
    const attr = normTR($(el).attr("data-sehir") ?? "");
    const header = normTR(
      $(el)
        .find(".ed-biletler__sehir__baslik, .ed-biletler__sehir__title, h3, h4")
        .first()
        .text(),
    );
    return attr === cityFilter || header.includes(cityFilter);
  });

  return sections.find("button.seanceSelect");
}

function checkTickets(html: string, cityFilter: string, activeText: string) {
  const $ = cheerio.load(html);
  const buttons = pickButtons($, cityFilter);

  const activeSeances: Array<{ date: string; venue: string }> = [];

  buttons.each((_, el) => {
    const btn = $(el);
    if (btn.attr("disabled")) return;

    const text = normTR(btn.text());
    if (!text.includes(activeText)) return;

    const wrap = btn.closest(".ed-biletler__sehir__gun, .ed-biletler__gun, li, .card, .seans");

    const timeEl = wrap.find("time[itemprop='startDate'], time").first();
    const date = ((timeEl.attr("datetime") ?? timeEl.text()) || "").trim();

    const venueEl = wrap.find("address[itemprop='name'], address, a[href*='/mekan/']").first();
    const venue = (venueEl.text() || "").trim();

    activeSeances.push({ date, venue });
  });

  return { count: buttons.length, activeSeances };
}

async function wasNotifiedRecently(keyParts: unknown[]): Promise<boolean> {
  const kv = await kvPromise;
  const existing = await kv.get<number>(keyParts);
  return Boolean(existing.value);
}

async function markNotified(keyParts: unknown[]): Promise<void> {
  const kv = await kvPromise;
  await kv.set(keyParts, Date.now(), { expireIn: DEDUPE_TTL_MS });
}

async function sendTelegram(tgToken: string, tgChatId: string, message: string) {
  if (!tgToken || !tgChatId) return;

  const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: tgChatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
}

function buildMessage(url: string, cityFilter: string, activeSeances: Array<{ date: string; venue: string }>) {
  let msg = `<b>Bilet Açıldı</b>`;
  if (cityFilter) msg += `\nŞehir: ${cityFilter}`;

  if (activeSeances.length) {
    msg += `\n\n<b>Müsait Seanslar</b>`;
    for (const s of activeSeances) {
      msg += `\n• ${s.date}${s.venue ? ` | ${s.venue}` : ""}`;
    }
  }

  msg += `\n\n${url}`;
  return msg;
}

async function runOnce() {
  const { url, tgToken, tgChatId, activeText, cityFilter } = getConfig();

  if (!url) {
    console.log("WATCH_URL missing, skipping this run");
    return;
  }

  const html = await fetchPage(url);
  const { count, activeSeances } = checkTickets(html, cityFilter, activeText);

  console.log(
    `[${new Date().toISOString()}] city=${cityFilter || "all"} buttons=${count} active=${activeSeances.length > 0}`,
  );

  if (activeSeances.length === 0) return;

  const key = ["ticketwatch", url, cityFilter, activeText];

  if (await wasNotifiedRecently(key)) {
    console.log("Duplicate prevented by KV");
    return;
  }

  const msg = buildMessage(url, cityFilter, activeSeances);
  await sendTelegram(tgToken, tgChatId, msg);
  await markNotified(key);
  console.log("Notified");
}

Deno.cron("ticket-watch", "* * * * *", async () => {
    const start = Date.now();
  
    while (Date.now() - start < 55_000) {
      try {
        await runOnce();
      } catch (err) {
        console.error("Error:", err);
      }
  
      const min = 10_000;
      const max = 14_000;
      const wait = Math.floor(min + Math.random() * (max - min));
      await sleep(wait);
    }
  });

// Workaround: HTTP handler ekle (cron-only projelerde deploy daha stabil oluyor)
Deno.serve(() => new Response("ok"));