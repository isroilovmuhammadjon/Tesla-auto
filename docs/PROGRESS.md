# Toshkent 1:1 — ish holati (keyingi sessiya shu yerdan davom etadi)

Branch: `feature/toshkent-1to1` (main'ga qo'shilmagan, foydalanuvchi tasdig'ini kutadi).
Preview: https://isroilovmuhammadjon.github.io/Tesla-auto/preview/feature-toshkent-1to1/ (`.github/workflows/preview.yml` har push'da yangilaydi).
To'liq natijalar: `docs/TOSHKENT-1TO1.md`.

Oxirgi sinalgan commit va keyingi vazifa shu fayl oxirida.

## 2026-11-28 kunduzgi ish (davomi)

### Rul: uzoq bosilgan A/D (asosiy shikoyat)
- **O'lchov** (Cobalt, `__steerTest`, `__liveSteer` real tugmalar bilan): tugma uzoq bosilsa g'ildirak 0.3 s ichida to'liq burilib, 60 km/soatda 0.84 g, 90 km/soatda 1.0 g so'rardi. Oddiy keng burilish 0.1–0.3 g talab qiladi, shuning uchun uzoq bosish ortiqcha burib yuborardi va haydovchi bitta burilishda 20–50 marta tugmani bosib-qo'yib yuborishga majbur edi.
- **Sabab:** tezlikka bog'liq chegara = tutish chegarasi + 0.06 rad. Kirish kechikishi (20–80 ms) ham, kadr tezligi ham sabab emas: 30/60/120 fps natijalari bir xil.
- **Tuzatildi** (`city.js`):
  - uzoq bosish endi tezlik oshgani sari kamayadigan yonlama tortish so'raydi: shaharda ~0.65–0.7 g, 90 km/soatda ~0.5 g (R≈124 m);
  - rul tezda sekinroq aylanadi: to'xtab turganda 0.3 s, 90 km/soatda ~0.65 s;
  - Spark'da rul tezroq (×1.15), Damas'da sekinroq (×0.82) va kuzovi ko'proq og'adi (×1.8).
  - Eski xatti-harakat solishtirish uchun `?test` ostida `legacy:'v2'` sifatida qoldi.
- **Sinov burilishlari:**
  - Temur Malik ko'chasi (graph edge 57560, 13.2 m, bir tomonlama, 49°): boshlanishi 41.337288, 69.378592, oxiri 41.333991, 69.377995.
  - Seul ko'chasi (66172): 41.29962, 69.232331 → 41.298594, 69.236102.
- **Natija** (inson kabi "pursuit" bot, 250 ms reaksiya; yangi / eski):

  | Burilish | km/soat | rms | tugma almashishi | eng katta yaw |
  |---|---|---|---|---|
  | Temur Malik | 60 | 0.26 / 0.34 m | 34 / 45 | 0.16 / 0.45 |
  | Temur Malik | 90 | 0.35 / 0.32 m | 17 / 25 | 0.20 / 0.39 |
  | Seul | 60 | 0.15 / 0.13 m | 25 / 48 | 0.16 / 0.45 |
  | Seul | 90 | 0.23 / 0.34 m | 14 / 27 | 0.13 / 0.39 |

- **Handling** (`__handling`):

  | | Cobalt | Spark | Damas |
  |---|---|---|---|
  | 100→0 tormoz | 46.8 m | 49.3 m | 63.1 m |
  | Uzoq bosish, 90 km/soat | 0.51 g | 0.48 g | 0.55 g |
  | 60 km/soatda chiziq almashtirish | 4.3 m | 3.7 m | 3.7 m |

  - Hammasida burilishda tormozlaganda teskari aylanish yo'q.
  - Orqaga yurish 16 km/soatgacha; g'ildiraklar haqiqiy harakat yo'nalishida aylanadi.

### Taksi
- **`carSnap`:** yo'ldan chiqqan mashina uchun to'g'ridan-to'g'ri yetib boriladigan (devor yoki bino kesmaydigan) eng yaqin ko'cha olinadi (`osmcity.clearLine`).
- **Tor mahalla burchaklari:** 4.5 m dan tor ko'chalar orasidagi 65° dan keskin burilishga +35 s, 110° dan keskiniga +120 s (`route.js turnCost`).
  - Sabab: Samarbonu → Hojiobod mahallasi yo'lida Maxzuna (4.1 m) → Maxorat (3.2 m) 90° burchagida uyga 835 urilish va 78 tiqilish bo'lgan.
  - Endi o'sha yo'l 2.99 km, tiqilish 0.
- **Nomlar:**
  - ruscha nomlar o'zbek lotiniga o'tkaziladi ("Газалхон улица" → "Gazalxon ko'chasi", "Рынок металла" → "Metalla bozori");
  - takroriy nomlarga kesishgan ko'cha qo'shiladi ("Do'kon (Burxona Margilani ko'chasi yonida)").
- **Buyurtma kartasi:** uzun manzil 2 qatorga sig'adi, narx va tugmalar siqilmaydi.
- **Smena testi** (`__testShift`, noto'g'ri burilish bilan, lokal Browser pane, MacBook):

  | Mashina | Masofa | Tiqilish | To'landi |
  |---|---|---|---|
  | Cobalt | 9.0 km | 1 | ha |
  | Gentra | 10.4 km | 2 | ha |
  | Nexia | 5.5 km | 0 | ha |
  | Damas | 7.5 km | 0 | ha |
  | Spark (alohida qayta haydovda) | 7.2 km | 0 | ha |
  | Spark (to'plamda) | — | — | yo'q |

  - To'plamdagi Spark yo'lovchigacha 135 m qolganda (-10777, 1883) burchagida qoldi: 3.8 m va 4.2 m nomsiz yo'laklar orasidagi 90° burilish. Test-bot uch nuqtali qayrilish qila olmadi.
  - Tuzatish: bunday burchakdan o'tadigan olish joylarini taklif qilmaslik yoki yo'lak kengligini OSM width/surat bilan tekshirish.

### Mashinalar
- **Tom va ustunlar:** endi kuzov rangida. Avval tom panel shisha ichida yashiringan edi, butun kabina qora blok bo'lib ko'rinardi.
- **Cobalt:** katta, burchakdan yon tomonga 44 sm o'tadigan chiroqlar; raqam yukxona qopqog'idagi chuqurchada, ustida xrom chiziq.
- **Gentra va Nexia:** o'z shaklidagi o'raluvchi chiroqlar.
- **Qora sedan** (Malibu uslubi): 4.92 m, ko'cha harakatiga qo'shildi (5%, asosan qora).
- **Salon:** taksi mashinalarida ko'rish burchagi 60° dan 52° ga tushdi; ko'z balandligi Spark'da 1.13 m, Damas'da 1.36 m.

### Footaj va suratlar (`docs/footage/`)
- `bend90-temur-before.webm`, `bend90-temur-after.webm`: Temur Malik ko'chasi burilishi (edge 57560), Cobalt, 90 km/soat, bir xil kamera, tezlik, A/W/D va g'ildirak burchagi ko'rinadi. Real vaqt, 150 ms reaksiyali pursuit-bot:

  | | rms | Eng katta chetlanish | Tugma bosish |
  |---|---|---|---|
  | Eski rul | 0.27 m | 0.94 m | 38 |
  | Yangi rul | 0.44 m | 1.09 m | 23 |

  Bot uchun yangi rul biroz kengroq yuradi, lekin kam tugma talab qiladi va silliqroq. Ikkalasi ham qatordan chiqmadi.
- `hudoff-tinchlik-chorsu.webm`: HUD o'chiq, Cobalt, Tinchlik metrosi → Chorsu bozori. 3.29 km, 4.7 daqiqa, tiqilish 0, urilish 0. Fayl 39 MB, Git'ga qo'shilmagan, faqat lokal.
- `cars-grid.png`: 6 mashina × 3 burchak (orqa 3/4, old 3/4, chase kamerasi).
  - Haqiqiy suratlar bilan yonma-yon solishtirish yo'q: qonuniy qayta foydalanish mumkin bo'lgan suratlar mavjud emas.
  - Blender yo'q.
  - Modellar hali protsedurali va soddalashtirilgan.

### Binolar va yo'llar: tashxis (`docs/geom-check.json`, 581 holat)
- 447 tasi 3 m yo'lak chetiga 1 m gacha kirgan uy burchagi (o'q chizig'i uydan o'tmaydi): OSM chiziq va uy konturi turli suratlardan chizilgan.
- 55 tasi yo'lak uy orqali o'tadi (o'tish joyi deb belgilanmagan).
- 41 tasi yo'lak uy ichida tugaydi.
- 5 tasi 19.2 m nomsiz keng hudud.
- Yo'l kengligi xatosi emas, shuning uchun binolar surilmadi.

### Suratlar
- Wikimedia Commons'dan qo'shimcha suratlar yuklab bo'lmadi: umumiy client nomi bilan so'rov 429 qaytardi, shaxsiy kontakt ma'lumoti qo'shilmadi.
- Tumanlar bo'yicha qamrov:

  | Tuman | Kerakli nuqtalar | Surat bor |
  |---|---|---|
  | Bektemir | 385 | 0 |
  | Chilonzor | 758 | 0 |
  | Mirobod | 654 | 1 |
  | Mirzo Ulug'bek | 902 | 0 |
  | Olmazor | 754 | 0 |
  | Sergeli | 719 | 0 |
  | Shayxontohur | 795 | 0 |
  | Uchtepa | 828 | 0 |
  | Yakkasaroy | 343 | 0 |
  | Yangi Toshkent | 384 | 0 |
  | Yangi hayot | 687 | 0 |
  | Yashnobod | 1178 | 0 |
  | Yunusobod | 1026 | 2 |

  Qolgan barcha manzara taxminiy (OSM geometriyasi + umumiy fasadlar).

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
Shu fayl bilan birga push qilingan commit (`git log -1`), preview'da tekshirildi.

## BIRINCHI TUGALLANMAGAN VAZIFA
- Yo'lovchini olish joyi faqat tor (≤4.5 m) yo'laklar orasidagi 90° burchak orqali yetiladigan bo'lsa, uni taklif qilmaslik. Masalan, (-10777, 1883) burchagida Spark qolib ketdi.
- So'ng `__testShift` bilan 5 mashinani qayta haydash.

## Keyingi navbat
1. **Qolgan obyektlar:**
   - 581 bino qatnov qismida (553 tasi 3 m yo'laklarda);
   - 3 bekat, 11 belgi, 8 radar ustuni (`docs/geom-check.json`).
2. **Taksi spawn atrofi:** takrorlanuvchi fasadlar, bir tekis daraxtlar.
3. **Mashinalar:**
   - old ko'rinish (panjara, chiroq shakllari) hali sodda;
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
