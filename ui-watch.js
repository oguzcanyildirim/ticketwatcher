#!/usr/bin/env node
const cheerio = require("cheerio");
const { exec } = require("child_process");

const URL = process.env.WATCH_URL;
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const ACTIVE_TEXT = "biletini al";

function beep() {
  process.stdout.write("\x07");
  if (process.platform === "darwin") exec("afplay /System/Library/Sounds/Glass.aiff", () => {});
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: "HTML"
      })
    });
  } catch (err) {
    console.error("Telegram error:", err.message);
  }
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
  let found = false;

  $("button.seanceSelect").each((i, el) => {
    const btn = $(el);
    // disabled attribute yoksa ve text "biletini al" içeriyorsa
    if (!btn.attr("disabled")) {
      const text = btn.text().trim().toLocaleLowerCase('tr-TR');
      if (text.includes(ACTIVE_TEXT)) {
        found = true;
        return false; // break
      }
    }
  });

  return found;
}

let lastNotified = 0;

(async () => {
  if (!URL) throw new Error("WATCH_URL missing");
  console.log("Watching:", URL);

  while (true) {
    try {
      const html = await fetchPage(URL);
      const active = hasActiveSeanceButton(html);

      if (active) {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Active seanceSelect found!`);
        beep();
        const now = Date.now();
        if (now - lastNotified > 10 * 60 * 1000) {
          await sendTelegram(
            `🎭 <b>Bilet Açıldı!</b>\n\n` +
            `<a href="${URL}">Hemen Al →</a>`
          );
          lastNotified = now;
        }
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] ❌ No active seanceSelect`);
      }
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, err.message);
    }

    const min = 5000, max = 8000;
    const wait = Math.floor(min + Math.random() * (max - min));
    await sleep(wait);
  }
})();