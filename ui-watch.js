#!/usr/bin/env node
const cheerio = require("cheerio");

const URL = process.env.WATCH_URL;
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const ACTIVE_TEXT = (process.env.ACTIVE_TEXT || "biletini al").toLocaleLowerCase("tr-TR");
const CITY_FILTER = process.env.CITY_FILTER || ""; // Boşsa tüm şehirler, değilse sadece o şehir (örn: "Ankara")
const MAX_RUNTIME_MS = parseInt(process.env.MAX_RUNTIME_MS || "240000", 10); // 4 dakika
const MIN_WAIT_MS = parseInt(process.env.MIN_WAIT_MS || "5000", 10);
const MAX_WAIT_MS = parseInt(process.env.MAX_WAIT_MS || "8000", 10);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function sendTelegram(message) {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.log("Telegram disabled: TG_BOT_TOKEN or TG_CHAT_ID missing");
    return;
  }

  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  return await res.text();
}

function hasActiveSeanceButton(html) {
  const $ = cheerio.load(html);

  // Şehir filtresi varsa sadece o şehrin bölümüne bak
  let buttons;
  if (CITY_FILTER) {
    const citySection = $(`.ed-biletler__sehir[data-sehir="${CITY_FILTER}"]`);
    buttons = citySection.find("button.seanceSelect");
  } else {
    buttons = $("button.seanceSelect");
  }

  const count = buttons.length;

  let active = false;
  let activeSeances = [];

  buttons.each((_, el) => {
    const btn = $(el);

    if (btn.attr("disabled")) return;

    const text = btn.text().trim().toLocaleLowerCase("tr-TR");
    if (text.includes(ACTIVE_TEXT)) {
      active = true;
      // Seans bilgisini al (tarih ve mekan)
      const seanceDiv = btn.closest(".ed-biletler__sehir__gun");
      const date = seanceDiv.find("time[itemprop='startDate']").text().trim();
      const venue = seanceDiv.find("address[itemprop='name']").text().trim();
      activeSeances.push({ date, venue });
    }
  });

  return { active, count, activeSeances };
}

(async () => {
  if (!URL) throw new Error("WATCH_URL missing");

  const started = Date.now();
  console.log("Watching:", URL);
  console.log("ACTIVE_TEXT:", ACTIVE_TEXT);
  console.log("CITY_FILTER:", CITY_FILTER || "(tüm şehirler)");
  console.log("MAX_RUNTIME_MS:", MAX_RUNTIME_MS);

  while (Date.now() - started < MAX_RUNTIME_MS) {
    try {
      const html = await fetchPage(URL);
      const { active, count, activeSeances } = hasActiveSeanceButton(html);

      const cityInfo = CITY_FILTER ? ` (${CITY_FILTER})` : "";
      console.log(`[${new Date().toLocaleTimeString()}] seanceSelect${cityInfo}: ${count} | active: ${active}`);

      if (active) {
        let message = `🎭 <b>Bilet Açıldı!</b>`;
        if (CITY_FILTER) {
          message += `\n📍 Şehir: ${CITY_FILTER}`;
        }
        if (activeSeances.length > 0) {
          message += `\n\n<b>Müsait Seanslar:</b>`;
          activeSeances.forEach(s => {
            message += `\n• ${s.date}${s.venue ? ` - ${s.venue}` : ""}`;
          });
        }
        message += `\n\n<a href="${URL}">Hemen Al →</a>`;

        await sendTelegram(message);
        console.log("Notified. Exiting.");
        process.exit(0);
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, err.message);
    }

    const wait = Math.floor(MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS));
    await sleep(wait);
  }

  console.log("Max runtime reached. Exiting.");
  process.exit(0);
})();