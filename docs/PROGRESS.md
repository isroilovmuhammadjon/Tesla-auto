# Toshkent 1:1 — ish holati (keyingi sessiya shu yerdan davom etadi)

Branch: `feature/toshkent-1to1` (main'ga qo'shilmagan, foydalanuvchi tasdig'ini kutadi).
Preview: https://isroilovmuhammadjon.github.io/Tesla-auto/preview/feature-toshkent-1to1/ (`.github/workflows/preview.yml` har push'da yangilaydi).
To'liq natijalar: `docs/TOSHKENT-1TO1.md`.

Oxirgi sinalgan commit va keyingi vazifa shu fayl oxirida.

## 2026-11-28 tungi ish

### 1. Rul va fizika (`city.js`, `vehicle.js`, `uzplayer.js`)
- **Sabab:**
  - Avval A/D bosilganda g'ildirak 70 ms ichida tezlik chegarasigacha burilardi: "hammasi yoki hech narsa". 90 km/soatda qisqa bosish 1.8 m sakrash berardi.
  - Old shina to'yinib, burilish sekinlashardi.
  - Kamera burilishdan ~0.3 s orqada qolardi.
- **Tuzatildi:**
  - virtual rul `wheelU`: A/D uni sekin aylantiradi, qarshi tomonga tezroq; qo'yib yuborilganda o'rtaga qaytadi;
  - old shina sirpanish cheklovchisi;
  - yonlama sirpanishga qarshi ESC;
  - EBD va rulga bog'liq ABS;
  - orqaga yurish chegarasi; g'ildiraklar orqaga ham aylanadi;
  - kamera tezlikda tezroq ergashadi.
- **O'lchovlar** (Cobalt, real vaqt, klaviatura hodisalari):
  - qisqa bosish: 90 km/soatda 0.9° / 0.4 m (avval 5.7° / 1.8 m);
  - kirishdan burilishgacha kechikish 20–80 ms.
- **Burilish testi:** Seul ko'chasi, graph edge 66172, 40-metrdan, R≈310 m, 75°.

  | km/soat | rms yangi | rms eski | tugma almashishi yangi | eski |
  |---|---|---|---|---|
  | 30 | 0.45 m | 0.46 m | 51 | 56 |
  | 60 | 0.55 m | 0.42 m | 27 | 38 |
  | 90 | 0.59 m | 0.34 m | 17 | 31 |

- **Burilishda tormoz:** 60 va 90 km/soatda teskari aylanish yo'q; to'xtash 16.8 m va 37.2 m.
- **Mashinalar:**

  | Mashina | Lateral g | Burilish doirasi (taxmin) |
  |---|---|---|
  | Cobalt | 0.84 | 13.6 m |
  | Spark | 0.82 | 11.6 m |
  | Damas | 0.80 | 9.6 m |

  Damas'ning ko'tarilgan og'irlik markazi va kalta bazasi uni boshqacha his qildiradi.

### 2. Belgilar va radarlar (`build.py`, `osmbuild.js`, `osmcity.js`, `ui.js`)
- **10 258 belgi:**
  - tezlik, bir tomonlama, kirish taqiqlangan;
  - STOP va yo'l bering (OSM tugunlari);
  - burilish cheklovlari.
- Belgilar yaqinlashish tomoniga qaragan va o'ng bordyurda turadi.
- Boshqa qatnov qismiga tushib qoladiganlari siljitiladi; 101 tasi uchun joy topilmadi va qo'yilmadi.
- **133 OSM radar.** Yo'nalish: forward/backward, bir tomonlama, kompas burchagi yoki ikki tomon. 120 m oldin tezlik va radar belgisi turadi.
- **Jarima:** o'zbekcha karta; ballar 250 000 / 500 000 / 1 000 000 so'm (o'yin qiymatlari). Taksi balansidan yechiladi.
- **Sinov** (radar 304264511, 60 km/soat):

  | Holat | Natija |
  |---|---|
  | 50 va 60 km/soat | jarima yo'q |
  | 75 km/soat | 250 000 |
  | 110 km/soat | 1 000 000 |
  | Teskari yo'nalish 80 km/soat | o'tish hisoblanmadi |
  | Radar oldida to'xtash | jarima yo'q |
  | Har o'tishda | bitta jarima (8 s cooldown) |

### 3. Yo'llar va taksi (`taxi.js`, `route.js`, `faceRoad`)
- **Mahalla tiqilishining sababi:** yo'lovchini olgandan keyin marshrut 5.5 m ko'chada orqaga qayrilishni talab qilardi.
- **Tuzatildi:**
  - yo'lovchi ko'chaning qaysi tomonidan olinishi endi yo'lovchigacha va manzilgacha bo'lgan umumiy vaqt bo'yicha tanlanadi;
  - joyida qayrilish narxi ko'cha kengligiga bog'liq: 25 / 60 / 150 s.
- **Qatnov qismidagi obyektlar** (`check_geometry.py`):

  | Obyekt | Oldin | Keyin |
  |---|---|---|
  | Bekatlar | 23 | 3 |
  | Belgilar | 1 206 | 11 |
  | Radar ustunlari | 93 | 8 |

- **Smena testi** (`__testShift`): real chorrahada noto'g'ri burilish, uch nuqtali qayrilish, tiqilish joylari jurnalga yoziladi. Natijalar pastda.
