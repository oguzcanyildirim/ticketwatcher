import * as cheerio from "npm:cheerio@1.1.2";

const URL = Deno.env.get("WATCH_URL")!;
const TG_TOKEN = Deno.env.get("TG_BOT_TOKEN");
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID");

const ACTIVE_TEXT = normTR(Deno.env.get("ACTIVE_TEXT") ?? "biletini al");
const CITY_FILTER = normTR(Deno.env.get("CITY_FILTER") ?? "");

// dakikada 2 kontrol
const SECOND_CHECK_DELAY_MS = 30_000;

// duplicate engeli
const DEDUPE_TTL_MS = 15 * 60 * 1000;

function normTR(s: string) {
  return (s ?? "").toLocaleLowerCase("tr-TR").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const server = res.headers.get("server") ?? "";
  const cfRay = res.headers.get("cf-ray") ?? "";
  console.log(`HTTP ${res.status} server=${server} cf-ray=${cfRay ? "yes" : "no"}`);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  const low = html.toLowerCase();
  if (low.includes("just a moment") || low.includes("cf-challenge") || low.includes("captcha")) {
    console.log("Possible challenge page detected.");
  }

  return html;
}

function pickButtons($: cheerio.CheerioAPI) {
  if (!CITY_FILTER) return $("button.seanceSelect");

  const sections = $(".ed-biletler__sehir").filter((_, el) => {
    const attr = normTR($(el).attr("data-sehir") ?? "");
    const header = normTR(
      $(el)
        .find(".ed-biletler__sehir__baslik, .ed-biletler__sehir__title, h3, h4")
        .first()
        .text(),
    );
    return attr === CITY_FILTER || header.includes(CITY_FILTER);
  });

  return sections.find("button.seanceSelect");
}

function checkTickets(html: string) {
  const $ = cheerio.load(html);
  const buttons = pickButtons($);

  const activeSeances: Array<{ date: string; venue: string }> = [];

  buttons.each((_, el) => {
    const btn = $(el);
    if (btn.attr("disabled")) return;

    const text = normTR(btn.text());
    if (!text.includes(ACTIVE_TEXT)) return;

    const wrap = btn.closest(".ed-biletler__sehir__gun, .ed-biletler__gun, li, .card, .seans");

    const timeEl = wrap.find("time[itemprop='startDate'], time").first();
    const date = ((timeEl.attr("datetime") ?? timeEl.text()) || "").trim();

    const venueEl = wrap.find("address[itemprop='name'], address, a[href*='/mekan/']").first();
    const venue = (venueEl.text() || "").trim();

    activeSeances.push({ date, venue });
  });

  return { count: buttons.length, activeSeances };
}

async function wasNotifiedRecently(): Promise<boolean> {
  const kv = await Deno.openKv();
  const key = ["ticketwatch", URL, CITY_FILTER, ACTIVE_TEXT];
  const existing = await kv.get<number>(key);
  return Boolean(existing.value);
}

async function markNotified(): Promise<void> {
  const kv = await Deno.openKv();
  const key = ["ticketwatch", URL, CITY_FILTER, ACTIVE_TEXT];
  await kv.set(key, Date.now(), { expireIn: DEDUPE_TTL_MS });
}

async function sendTelegram(message: string) {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.log("Telegram disabled: missing TG_BOT_TOKEN or TG_CHAT_ID");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
}

function buildMessage(activeSeances: Array<{ date: string; venue: string }>) {
  let msg = `🎭 <b>Bilet Açıldı</b>`;
  if (CITY_FILTER) msg += `\n📍 ${CITY_FILTER}`;

  if (activeSeances.length > 0) {
    msg += `\n\n<b>Müsait Seanslar</b>`;
    for (const s of activeSeances) {
      const line = s.venue ? `• ${s.date} | ${s.venue}` : `• ${s.date}`;
      msg += `\n${line}`;
    }
  }

  msg += `\n\n<a href="${URL}">Hemen Al</a>`;
  return msg;
}

async function runOnce() {
  const html = await fetchPage(URL);
  const { count, activeSeances } = checkTickets(html);

  console.log(
    `[${new Date().toISOString()}] city=${CITY_FILTER || "all"} buttons=${count} active=${activeSeances.length > 0}`,
  );

  if (activeSeances.length === 0) return;

  if (await wasNotifiedRecently()) {
    console.log("Duplicate prevented by KV.");
    return;
  }

  const msg = buildMessage(activeSeances);
  await sendTelegram(msg);
  await markNotified();
  console.log("Notified.");
}

// Startup check
if (!URL) {
  console.error("WATCH_URL missing!");
  Deno.exit(1);
}

console.log("🎬 ticket-watch started");
console.log(`   URL: ${URL}`);
console.log(`   CITY_FILTER: ${CITY_FILTER || "(all)"}`);
console.log(`   ACTIVE_TEXT: ${ACTIVE_TEXT}`);

Deno.cron("ticket-watch", "* * * * *", async () => {
  try {
    await runOnce();
  } catch (err) {
    console.error("Error (first check):", err);
  }

  await sleep(SECOND_CHECK_DELAY_MS);

  try {
    await runOnce();
  } catch (err) {
    console.error("Error (second check):", err);
  }
});