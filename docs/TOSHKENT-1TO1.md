# Toshkent 1:1 — holat va sinov natijalari

**Branch:** `feature/toshkent-1to1`, `main`'ga qo'shilmagan.
**Preview:** https://isroilovmuhammadjon.github.io/Tesla-auto/preview/feature-toshkent-1to1/

## 1. Geometriya (`docs/geom-check.json`, `scripts/tashkent-map/check_geometry.py`)

**Sabablar:**
- Kesishmalarning 77% qismi kengligi taxmin qilingan 4,2 m'lik mahalla yo'laklarida. Bu yo'laklarda OSM'dagi uy konturlari o'q chiziqqa 2 m'dan yaqin turibdi.
- Qolganlari:
  - OSM'da yo'l chizig'i bino orqali o'tgan joylar (arka yoki yopiq kirish);
  - yo'l bo'ylab yoki yo'lni kesib chizilgan devorlar;
  - yo'lga qo'yilgan darvoza nuqtalari.
- O'yinda yer tekis bo'lgani uchun ko'priklar ham devorga urilardi.

**Tuzatishlar:**
- Kengligi taxminiy yo'l eng yaqin binogacha bo'lgan masofaga toraytiriladi (9 825 yo'l, eng kam 3 m). Kengligi OSM'da belgilangan yo'llar ko'pi bilan 20% toraytiriladi.
- Yo'l o'q chizig'i 1 m'dan uzunroq kesib o'tadigan bino "arka" hisoblanadi: u ko'rinadi, lekin to'qnashmaydi (229 ta).
- Devorlar yo'l va ko'priklar kesib o'tgan joyda ochiladi (478 joy), yo'l bo'ylab ketgan qismlari bordyurgacha qisqartiriladi.
- Yo'l ustidagi darvozalar ochiq chiziladi (1 000 ta).
- Bordyuri binoga tushadigan ko'chalarda (2 067 ta) taksi to'xtamaydi.

| Tekshiruv | Oldin | Keyin |
|---|---|---|
| Yo'l ustidagi binolar (> 4 m²) | 3 468 | 581 |
| Yo'l ustidagi devorlar | 270 | 0 |
| Yo'lni to'sgan darvozalar | 998 | 0 |
| Bordyurdan keyin ham yo'lda qolgan bekatlar | — | 23 (2 008 dan) |
| Bino ichidagi taksi bordyur nuqtalari | 1 465 / 88 802 | 284 / 75 438 |

**Qolgan muammolar:**
- 581 bino: 553 tasi 3 m'gacha toraytirilgan yo'laklarda, u yerda OSM konturi o'q chiziqqa 1,5 m'dan yaqin. Bu ma'lumotdagi to'qnashuv, joylashuvlari `geom-check.json`'da.
- 23 bekat ikki tomonlama yo'llarning mediana tomonida turibdi.

## 2. Haqiqiy va o'yin ko'rinishlari
Uchta sanasi aniq Wikimedia Commons surati asosida (CC BY-SA 4.0; suratlar repoga qo'shilmagan, havolalari quyida). O'yin ko'rinishi suratning GPS nuqtasidan, kompas yo'nalishidan va kamera balandligidan olindi. Rasmlar `docs/matched/` papkasida.

| Joy | Surat | Oldin | Tuzatilgan | Qolgan farq |
|---|---|---|---|---|
| Sayilgoh, yuridik universitet (1,6 m, 343°) | [Kayumova Samira, 2024-10-20](https://commons.wikimedia.org/wiki/File:Toshkent_davlat_yuridik_instituti,_qizlar_gimnaziyasi.jpg) | Kulrang shisha panel, daraxt yo'q | OSM `building:material=brick` hisobga olindi: sariq g'isht, arkali derazalar; daraxtlar bino konturiga qarab qoldiriladi; yo'l chiziqlari | Tom bo'rtmalari, eshik, daraxt turi |
| Toshkent kurantlari (1,6 m, 171°) | [Kayumova Samira, 2024-10-20](https://commons.wikimedia.org/wiki/File:%D0%A2%D0%B0%D1%88%D0%BA%D0%B5%D0%BD%D1%82%D1%81%D0%BA%D0%B8%D0%B5_%D0%BA%D1%83%D1%80%D0%B0%D0%BD%D1%82%D1%8B_1947.jpg) | Minora yo'q, faqat panjara | Minora va oynavand ayvonli pavilon modeli, fasadi suratga ko'ra shimolga qaratildi | Arkali derazalar, katta daraxtlar; kamera telefon GPS xatosi tufayli 8 m janubga surildi |
| Amir Temur xiyoboni (yuqoridan, 16 m, 130°) | [Diloromkhan, 2023-11-08](https://commons.wikimedia.org/wiki/File:A._Temur_xiyoboni.jpg) | Forumlar saroyi yo'q, daraxtlar bir xil | Forumlar saroyi (ustunlar, gumbaz); daraxt rangi xilma-xil | Daraxt shakllari, oldingi yo'l va panjara |

Tumanlar bo'yicha suratli ko'rinishlar: `docs/PHOTO-NEEDS.csv`. Unda nomli asosiy va o'rta ko'chalarda har 300 m'da harakat yo'nalishidagi 9 413 nuqta bor; 3 tasida surat bor. Mapillary tokeni berilsa, shu ro'yxat bo'yicha suratlar yig'iladi.

## 3. Mashinalar (kuzatuv kamerasidan)
- Kuzov burun va orqada yumaloqlangan, oyna qismi tepaga qarab torayadi, haqiqiy shina va disklar (Spark'da 4 parrak, Damas'da qopqoq).
- Orqa chiroqlar har modelda o'z shaklida: Cobalt baland, Gentra yotiq, Nexia 3 katta, Spark va Damas tik. Chiroqlar yon tomonga o'raladi.
- Orqaga yurish chiroqlari, yukxonada xrom chiziq, O'zbekiston raqam belgisi.
- Rasmlar: `docs/vehicles/cobalt-rear-before.jpg` va `docs/vehicles/cobalt-rear-after.png`.
- Hali yo'q: har bir modelning alohida kabinasi, old chiroq shakllari va mashina suratlari bilan aniq taqqoslash.

## 4. HUD o'chiq uzluksiz haydovlar (preview'da, 25× tezlikda)

| Marshrut | km | Tumanlar | Yetdi | Tiqilish | Yo'ldan chiqish | Mashinaga tegish |
|---|---|---|---|---|---|---|
| Sergeli-5 → Chilonzor-13 | 10,5 | Sergeli, Yakkasaroy, Chilonzor, Uchtepa | ha | 0 | 4 / 570 | 33 |
| O'rikzor bozori → Tinchlik metrosi | 11,0 | Uchtepa, Shayhontohur, Olmazor | ha | 0 | 0 / 472 | 3 |
| Bektemir → Chorsu bozori | 17,2 | Bektemir, Mirobod, Yashnobod, M. Ulug'bek, Yunusobod, Shayhontohur | ha | 0 | 2 / 865 | 67 |
| Minor (Yunusobod) → Yuqori Beshqo'rg'on (Olmazor) | 9,7 | Yunusobod, Olmazor | ha | 0 | 0 / 494 | 7 |
| Bolta (Yangi Toshkent) → Qo'yliq 3 | 17,2 | Yangi Toshkent, Bektemir, Yashnobod, Mirobod | ha | 0 | 7 / 801 | 5 |

Mashinaga tegishlar sinov haydovchisi oqimni chetlab o'tolmasligidan. Kadrlar `docs/hud-off/` papkasida.

**Haydovlar paytida topilgan va tuzatilgan o'yin xatolari:**
- chorrahadagi har bir svetofor alohida fazada ishlab, abadiy qizil hosil qilardi;
- kesishuvchi oqim bir-birini abadiy kutardi;
- bir nuqtada turgan mashinalar bir-birini ko'rmay to'planardi;
- qarshidan kelgan mashina bilan "boshma-bosh" qulf;
- parallel yon yo'lda marshrut qayta hisoblanmasdi;
- ko'prik ostidagi devor ko'prikni to'sardi.

## 5. To'liq taksi smenasi (o'yin interfeysi orqali, Gentra)
1. Buyurtma qabul qilindi: Mahzuna ko'chasi → Oq Masjid mahallasi, 2,85 km, 12 500 so'm.
2. Mashina yo'lovchigacha 858 m yurdi va uning tomonida, undan 5,3 m'da to'xtadi; yo'lovchi o'tirdi.
3. Ataylab noto'g'ri burilishdan keyin marshrut qayta hisoblandi (2,85 → 2,70 km).
4. Yo'lovchi tushdi, 12 500 so'm bir marta to'landi, darhol yangi buyurtma chiqdi.
5. Sahifa yangilangandan keyin balans saqlanib qoldi: 12 500 so'm, 1 safar.

Kamchilik: tor mahalla ko'chalarida sinov haydovchisi 27 marta tiqildi va marshrut 23 marta qayta hisoblandi. Bu ko'chalar odam boshqarishida ham qiyin bo'lishi mumkin.

## 6. Tumanlar bo'yicha qamrov
"Surat" ustuni: suratli ko'rinishlar / kerakli ko'rinishlar.

| Tuman | OSM yo'l km | Marshrutdagi km | Ulanmagan guruh | Binolar | Balandligi OSM'da | Bekat nomli / nomsiz | Metro kirishi raqamli / raqamsiz | Surat |
|---|---|---|---|---|---|---|---|---|
| Bektemir Tumani | 390.2 | 390.7 | 8 | 16 503 | 458 | 48 / 4 | 0 / 1 | 0 / 385 |
| Chilonzor Tumani | 646.7 | 647.5 | 16 | 15 906 | 2 880 | 187 / 11 | 0 / 39 | 0 / 758 |
| Mirobod Tumani | 364.4 | 367.4 | 24 | 12 833 | 1 732 | 120 / 17 | 0 / 16 | 1 / 654 |
| Mirzo Ulug‘bek Tumani | 686.0 | 663.4 | 21 | 19 678 | 2 919 | 218 / 12 | 0 / 19 | 0 / 902 |
| Olmazor Tumani | 673.5 | 683.1 | 22 | 24 705 | 2 134 | 164 / 24 | 0 / 4 | 0 / 754 |
| Sergeli tumani | 777.8 | 775.3 | 14 | 28 726 | 1 862 | 112 / 4 | 0 / 5 | 0 / 719 |
| Shayhontohur Tumani | 571.9 | 575.1 | 43 | 24 295 | 3 074 | 140 / 28 | 0 / 20 | 0 / 795 |
| Uchtepa Tumani | 566.0 | 570.3 | 6 | 26 468 | 1 533 | 172 / 2 | 0 / 0 | 0 / 828 |
| Yakkasaroy Tumani | 293.8 | 295.1 | 6 | 10 120 | 1 635 | 82 / 8 | 0 / 3 | 0 / 343 |
| Yangi Toshkent Tumani | 865.5 | 860.8 | 14 | 32 227 | 298 | 1 / 18 | 0 / 0 | 0 / 384 |
| Yangi hayot tumani | 552.6 | 554.9 | 9 | 16 494 | 1 503 | 84 / 21 | 0 / 1 | 0 / 687 |
| Yashnobod Tumani | 1070.3 | 1066.1 | 37 | 34 782 | 2 891 | 199 / 44 | 0 / 7 | 0 / 1178 |
| Yunusobod Tumani | 820.4 | 824.3 | 22 | 26 548 | 2 618 | 218 / 20 | 0 / 29 | 2 / 1026 |

## Ishonch darajasi
- **O'ynasa bo'ladigan va tekshirilgan:**
  - 13 tumanning hammasida yo'l tarmog'i: 338/338 tuman juftligi uchun marshrut topiladi;
  - 208 ta burilish taqiqi tekshirilgan, buzilish yo'q;
  - 5 ta uzluksiz haydov va to'liq taksi safari.
- **OSM bo'yicha joylashuvi aniq:**
  - ko'cha nomlari, bekatlar (pozitsiya farqi ≤ 0,7 m), metro kirishlari;
  - devor, darvoza, eshik, daraxt, qatorlar soni (belgilangan joylarda).
- **Taxminiy:**
  - binolarning 91% balandligi;
  - fasad uslublari (OSM material belgisi bo'lmasa);
  - kengligi belgilanmagan yo'llar;
  - yer relyefi, ko'prik va tunnellarning balandligi.
- **Tasdiqlanmagan:** ko'cha darajasidagi ko'rinish. Faqat 3 ta surat nuqtasida tekshirilgan, qolgan 9 410 ta nuqtaga surat kerak.
