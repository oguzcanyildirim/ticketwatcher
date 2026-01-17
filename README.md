# 🔍 UI Watch

Web sayfası izleme ve buton otomasyonu aracı. Belirli bir sayfayı düzenli olarak yeniler, hedef buton aktif hale geldiğinde otomatik tıklar ve sizi bildirimle uyarır.

## 🚀 Kurulum

```bash
npm install
```

Bu komut:
1. Tüm bağımlılıkları yükler
2. Playwright Chromium tarayıcısını otomatik indirir

## 📖 Kullanım

### Temel Kullanım

```bash
node ui-watch.js "https://example.com" "button.submit"
```

### Parametreler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `url` | İzlenecek web sayfası URL'si | (zorunlu) |
| `selector` | Hedef butonun CSS selector'ü | (zorunlu) |
| `-i, --interval` | Yenileme aralığı (saniye) | 30 |
| `--headless` | Tarayıcıyı gizli modda çalıştır | Kapalı |
| `--no-click` | Otomatik tıklamayı kapat | Kapalı |
| `-t, --timeout` | Sayfa yükleme timeout (ms) | 30000 |

### Selector Örnekleri

```bash
# CSS Selector ile
node ui-watch.js "https://site.com" "button.buy-now"
node ui-watch.js "https://site.com" "#checkout-btn"
node ui-watch.js "https://site.com" "[data-action='purchase']"

# Text içeriği ile
node ui-watch.js "https://site.com" "text=Satın Al"
node ui-watch.js "https://site.com" "text=Add to Cart"

# XPath ile
node ui-watch.js "https://site.com" "//button[contains(@class, 'submit')]"
```

### Gerçek Dünya Örnekleri

```bash
# Stok takibi - 10 saniyede bir kontrol
node ui-watch.js "https://shop.com/product" "button:has-text('Sepete Ekle')" -i 10

# Bilet satışı - headless modda, hızlı kontrol
node ui-watch.js "https://tickets.com/event" ".buy-ticket:not([disabled])" -i 5 --headless

# Sadece izle, tıklama yapma
node ui-watch.js "https://site.com" "#submit" --no-click
```

## 🔔 Bildirimler

Araç şu durumlarda sizi uyarır:
- 🎯 Buton aktif hale geldiğinde (masaüstü bildirimi + ses)
- ✅ Tıklama başarılı olduğunda
- ❌ Hata oluştuğunda

## ⚙️ Buton Durumu Kontrolü

Araç şu kriterlere göre butonun "aktif" olup olmadığını kontrol eder:

1. Element sayfada mevcut mu?
2. Element görünür mü?
3. `disabled` attribute'u var mı?
4. `aria-disabled="true"` var mı?
5. Class'ında "disabled" geçiyor mu?

## 🛑 Durdurma

Aracı durdurmak için `Ctrl+C` tuşlarına basın.

## 📝 Notlar

- İlk çalıştırmada tarayıcı görünür modda açılır, böylece ne olduğunu görebilirsiniz
- Login gerektiren sayfalar için önce manuel giriş yapmanız gerekebilir
- Çok agresif refresh yapmak sizi engelletebilir, makul aralıklar kullanın
