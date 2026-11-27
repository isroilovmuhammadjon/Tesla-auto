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

**Smena natijalari** (lokal, Browser pane, Chrome asosidagi; tezlashtirilgan vaqt):
- Noto'g'ri burilishsiz 4 safar: hammasi to'landi, tiqilish 0.
- Noto'g'ri burilish bilan oxirgi to'plam:

  | Mashina | Masofa | Tiqilish | Uch nuqtali qayrilish | To'landi |
  |---|---|---|---|---|
  | Cobalt | 10.7 km | 0 | 1 | ha |
  | Gentra | 1.9 km | 2 | 1 | ha |
  | Spark | 8.2 km | 1 | 1 | ha |
  | Nexia | 14.6 km | 37 | — | yo'q |

- **Nexia ochiq muammo:** noto'g'ri burilish va qayta hisoblashdan keyin test-bot uylar orasiga (yo'l yo'q joyga) kirib qoldi. O'yinchi yo'lda bo'lsa bu holat bo'lmaydi, lekin `carSnap()` yo'ldan chiqqan mashina uchun uzoqdagi ko'chani tanlashi mumkin.
- Bu kecha avvalgi natija: 27 tiqilish, 23 qayta hisoblash.

### 4. Mashinalar (`uzcars.js`, `uzplayer.js`)
- Orqa chiroqlar, ko'rsatkichlar, bamperlar, panjara, raqamlar va old chiroqlar endi kuzovning haqiqiy old va orqa yuzasida turadi. Avval ular 7–10 sm ichkarida yashirinib, quti kabi chiqib turardi.
- Bamperlar kuzov rangida, pastki qismi qora; Damas'da qora bamper qoladi.
- Rul burchagi haqiqiy burilish doirasidan olindi:

  | Mashina | O'yinda | Haqiqiy |
  |---|---|---|
  | Cobalt | 10.2 m | ~10.6 m |
  | Spark | 9.6 m | ~9.8 m |
  | Damas | 8.3 m | ~8.4 m |

  Seul burilishi testi o'zgarmadi (rms 0.45 / 0.55 / 0.52 m).
- `__carSheet('rear'|'front'|'side')`: barcha modellar studiyada yonma-yon.
- **Hali qilinmagan:**
  - Blender modellari;
  - Gentra/Nexia avlod farqlari;
  - qora sedan (Malibu uslubi, `malibu.js`) qayta ko'rilmadi;
  - salonlar.

### 5. Interfeys
- **Taksi va o'zbek mashinalari:** SCORE / BEST / NITRO yo'q; spidometr 0–200 (Damas 0–140); o'zbekcha tugma yozuvi.
- **Telefon (375×812):** buyurtma paneli minikarta va spidometr ostida, ko'cha nomi tugmalar ostida.
- Shahar tezlik belgisi poygada ko'rinmaydi.

### 6. Preview'da o'yinchi sifatida sinov (2026-11-28, Browser pane, MacBook; telefon faqat emulyatsiya, haqiqiy telefon yo'q)
- **To'liq taksi safari** (avtomatik bot, jonli preview): 12.4 km, noto'g'ri burilish va qayta hisoblash, 31 500 so'm. Sahifa yangilangach "Balans: 31 500 so'm · 1 ta safar" — bir marta saqlandi.
- **Qo'lda:**
  - menyu → Taksi → mashina tanlash → buyurtma kartasi, desktop va telefon o'lchamida;
  - shahar rejimi (0→48 km/soat);
  - garaj;
  - poyga (77 km/soat, poyga HUD'i joyida).
- **Teginish tugmalari** (emulyatsiya): Qabul qilish, GAS, ◀ ishlaydi; qo'yib yuborilganda rul o'rtaga qaytadi.

### Footaj (`docs/footage/`)
- `bend90-before.webm`, `bend90-after.webm`: Seul burilishi, Cobalt, 90 km/soat, bir xil kamera, tezlik va A/W/D ko'rinadi.
  - Real vaqt, 250 ms reaksiyali bot natijasi:

    | | rms | Tugma bosish |
    |---|---|---|
    | Eski rul | 0.52 m | 28 |
    | Yangi rul | 0.63 m | 18 |

  - Yangi rul silliqroq, kam tugma talab qiladi, lekin bu bot uchun chiziqdan chetlanish biroz kattaroq.
- `hudoff-navoiy-amirtemur.webm`: HUD o'chiq kunduzgi haydov, 45 s, tiqilish 0, to'qnashuv 0.

## Oxirgi sinalgan commit
`586aa6f` (preview'da tekshirildi).

## BIRINCHI TUGALLANMAGAN VAZIFA
- `taxi.js` → `reroute()`/`carSnap()`: yo'ldan chiqqan mashina uchun eng yaqin *yetib boriladigan* ko'chani tanlash (Nexia testi, (-11144, 2297) atrofi).
- So'ng `__testShift` bilan 5 mashinani qayta haydash.

## Keyingi navbat
1. **Qolgan obyektlar:**
   - 581 bino qatnov qismida (553 tasi 3 m yo'laklarda);
   - 3 bekat, 11 belgi, 8 radar ustuni (`docs/geom-check.json`).
2. **Taksi spawn atrofi:** takrorlanuvchi fasadlar, bir tekis daraxtlar.
3. **Mashinalar:**
   - Gentra/Nexia avlod farqlari;
   - qora sedan;
   - uzoqdagi mashinalar uchun yengil versiya (hozir faqat mayda detallar yashiriladi).
4. **Belgilar:** harakatdagi mashinadan o'qilishini skrinshot bilan tekshirish.
5. **Suratlar:** Mapillary token kerak (faqat lokal skriptda). `PHOTO-NEEDS.csv`: 9 413 nuqta, 3 tasida surat bor.
6. Foydalanuvchi tasdiqlagach `main`'ga birlashtirish.

## Ma'lumot
- OSM: Geofabrik Uzbekistan 2026-11-27. Xom ma'lumot `~/street-racing-3d-data/raw2.pkl` (`extract.py`), xarita `build.py` bilan quriladi (`map3`), so'ng `www/map`'ga nusxalanadi.
- **Diqqat:** `rsync --delete` ishlatmang. `ATTRIBUTION.txt`, `facade.png`, `spawn.json`, `street-models.json` faqat `www/map`'da.
- Map versiyasi: `osmcity.js` → `MAP_VER` (hozir `20261128f`).
- Mos suratlar: `~/street-racing-3d-data/refs/refs.json`.
