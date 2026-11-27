# TOSHKENT TAKSI — sinov hisoboti

Branch: `feature/toshkent-taksi`. Taksi prototipi (`Toshkent-Taksi.patch`) shu branch'ning birinchi commit'i sifatida qo'llandi, keyin kengaytirildi.

## Xarita manbasi
- **Manba:** OpenStreetMap ma'lumotlari (ODbL 1.0), Geofabrik Uzbekistan extract, **2026-11-27** (fayl vaqti 03:55 UTC, 126 MB).
- **Chegara:** OSM relation 2216724 (Toshkent shahri), 634 km². Undan 400 m tashqarigacha kiritilgan, shunda shahar chegarasidan o'tadigan halqa yo'li ham to'liq qoladi.
- **Skriptlar:** `scripts/tashkent-map/extract.py` va `build.py`. Ularni qayta ishga tushirsa, xarita qaytadan quriladi.
- **Natija:** 2 653 ta 500 m katak, 298 625 ta bino, 50 850 ta yo'l bo'lagi, 1 996 ta avtobus bekati, 51 ta metro bekati, 144 ta metro kirishi, 1 880 ta svetofor. Marshrut grafi 80 738 tugundan iborat. Qidiruvda 8 071 ta yozuv bor.
- **Binolar balandligi:** 8,7% binoda OSM'da balandlik yoki qavatlar soni bor. Qolgan 91,3% uchun balandlik bino turi va maydonidan taxmin qilingan.

## Tumanlar bo'yicha qamrov
Qavs ichidagi raqamlar eski xaritaniki (c78ee36). Eski xaritada xizmat yo'llari (avtoturargoh yo'laklari, hovli kirishlari) ham bor edi, shuning uchun uning km soni ko'proq. Binolar soni deyarli bir xil.

| Tuman | km² | Yo'l, km (yangi) | Yo'l, km (eski) | Binolar (yangi) | Binolar (eski) | Bekatlar | Metro bekati / kirish | Svetofor |
|---|---|---|---|---|---|---|---|---|
| Bektemir Tumani | 35.6 | 374 | 443 | 16 505 | 16 333 | 52 | 1 / 1 | 24 |
| Chilonzor Tumani | 30.3 | 632 | 908 | 15 891 | 15 861 | 205 | 6 / 39 | 212 |
| Mirobod Tumani | 16.7 | 353 | 492 | 12 826 | 12 769 | 141 | 4 / 16 | 194 |
| Mirzo Ulug‘bek Tumani | 38.7 | 666 | 883 | 19 677 | 19 614 | 227 | 5 / 19 | 221 |
| Olmazor Tumani | 33.7 | 668 | 878 | 24 698 | 24 668 | 196 | 1 / 4 | 208 |
| Sergeli tumani | 51.4 | 722 | 882 | 28 724 | 28 588 | 115 | 4 / 5 | 81 |
| Shayhontohur Tumani | 26.9 | 562 | 784 | 24 294 | 24 085 | 184 | 7 / 20 | 194 |
| Uchtepa Tumani | 28.2 | 555 | 662 | 26 468 | 26 292 | 171 | 0 / 0 | 137 |
| Yakkasaroy Tumani | 14.1 | 290 | 434 | 10 122 | 10 095 | 89 | 1 / 3 | 131 |
| Yangi Toshkent Tumani | 195.8 | 864 | 949 | 32 222 | 32 170 | 27 | 0 / 0 | 13 |
| Yangi hayot tumani | 42.1 | 550 | 615 | 16 492 | 16 377 | 96 | 7 / 1 | 34 |
| Yashnobod Tumani | 78.1 | 1020 | 1320 | 34 781 | 34 678 | 244 | 8 / 7 | 187 |
| Yunusobod Tumani | 41.3 | 806 | 1059 | 26 548 | 26 500 | 235 | 7 / 29 | 231 |

**Xulosa:** eski xarita ham 13 tumanning hammasini qamragan edi. Unda yetishmagan narsalar:
- ko'cha nomlari;
- bir tomonlama yo'llar;
- yo'l kengligi;
- ko'priklar va tunnellar;
- marshrut grafi;
- qidiruv;
- bino turlari;
- do'kon nomlari.

Ularning hammasi qo'shildi.

## Har bir tumandan bitta nomli joy OSM manbasi bilan solishtirildi
Bekatlar OSM tugun raqami bo'yicha solishtirildi. Jami 1 783 ta bekat tekshirildi, eng katta farq 0,7 m.

| Tuman | Joy (bekat) | OSM | Kenglik, uzunlik | O'yinda x, z | Farq |
|---|---|---|---|---|---|
| Bektemir Tumani | Majnuntol mahallasi | node 13623700787 | 41.24621, 69.38817 | 9055, 7084 | 0.23 m |
| Chilonzor Tumani | Beshyog'och maydoni | node 13374548873 | 41.30523, 69.24933 | -2565, 530 | 0.16 m |
| Mirobod Tumani | Islom Ota masjidi | node 4665654210 | 41.2767, 69.30863 | 2398, 3697 | 0.56 m |
| Mirzo Ulug‘bek Tumani | 4-sonli taksopark | node 13339363417 | 41.35972, 69.36193 | 6857, -5521 | 0.4 m |
| Olmazor Tumani | Eski Juva maydoni | node 9692088153 | 41.3296, 69.24009 | -3339, -2177 | 0.58 m |
| Sergeli tumani | Astrobod mahallasi | node 13324929848 | 41.24454, 69.2727 | -608, 7269 | 0.47 m |
| Shayhontohur Tumani | Ipakchi ko'chasi | node 13426693308 | 41.3295, 69.18897 | -7617, -2165 | 0.36 m |
| Uchtepa Tumani | Sverdlovsk uylari | node 4271055696 | 41.29168, 69.17847 | -8495, 2035 | 0.45 m |
| Yakkasaroy Tumani | Muqimiy ko'chasi | node 5730484554 | 41.279, 69.2444 | -2977, 3442 | 0.47 m |
| Yangi Toshkent Tumani | Янги махалля | node 5223629593 | 41.16938, 69.32827 | 4044, 15616 | 0.34 m |
| Yangi hayot tumani | Yangihayot mahallasi | node 13352013921 | 41.2135, 69.19779 | -6876, 10716 | 0.44 m |
| Yashnobod Tumani | Tuzel metro bekati | node 13672765420 | 41.29218, 69.35649 | 6403, 1979 | 0.23 m |
| Yunusobod Tumani | Jumamasjid ko'chasi | node 13341109578 | 41.37256, 69.27483 | -433, -6948 | 0.42 m |

## Sinalgan marshrutlar
Marshrutlar o'yin ichidagi graf bilan hisoblandi. Har 50 m'da yo'l chizilganmi va katak bormi, tekshirildi.

| Marshrut | km | Taxminiy vaqt | Tekshirilgan nuqtalar | Yo'q katak | Yo'lsiz nuqta |
|---|---|---|---|---|---|
| O'rikzor bozori → halqa yo'li → Ko'kcha Darvoza → Samarqand Darvoza → Navoiy → Amir Temur shoh ko'chasi → Amir Temur xiyoboni | 14,7 | 23 daq | 295 | 0 | 0 |
| O'rikzor bozori → Chorsu metro kirishi | 10,5 | 17 daq | 210 | 0 | 0 |
| Sergeli → Yakkasaroy → Mirobod → Yunusobod | 18,0 | 27 daq | 360 | 0 | 0 |
| Olmazor → Yunusobod → Mirzo Ulug'bek → Yashnobod → Mirobod → Bektemir | 20,7 | 32 daq | 414 | 0 | 0 |

**To'liq taksi safari o'yin interfeysi orqali o'tkazildi (Cobalt):**
1. Smena boshlandi va buyurtma chiqdi: O'rikzor bozori → Izza, 2,3 km, 11 500 so'm.
2. Buyurtma Enter bilan qabul qilindi va mashina 1,3 km yurib yo'lovchiga yetdi.
3. Yo'lovchi mashinaga o'tirdi.
4. Ataylab noto'g'ri burilish qilindi, marshrut qayta hisoblandi (2,0 → 2,9 km).
5. Mashina manzilga yetdi, yo'lovchi tushdi va to'lov bir marta olindi.
6. Darhol keyingi buyurtma chiqdi.
7. Sahifa yangilangandan keyin balans saqlanib qoldi (11 500 so'm, 1 safar).

Mashinani sinov skripti klaviatura tugmalari orqali haydadi.

## Mashinalar
Hamma modellar o'zimizniki, logotip yo'q.

| Mashina | Sinf | Tarif (so'm) | Maks. km/soat | Massa | Yuritma |
|---|---|---|---|---|---|
| Cobalt | Standart | 7 000 + 2 000/km | 170 | 1 160 kg | old |
| Gentra / Lacetti | Standart | 7 000 + 2 000/km | 178 | 1 210 kg | old |
| Nexia 3 | Ekonom | 6 000 + 1 700/km | 170 | 1 100 kg | old |
| Spark | Ekonom | 6 000 + 1 700/km | 155 | 960 kg | old |
| Damas | Yuk-yo'lovchi | 5 500 + 1 500/km | 112 | 880 kg | orqa |
| Qora sedan (Malibu uslubida) | Komfort | 10 000 + 2 900/km | 240 | 1 540 kg | old |

- Har bir mashinaning o'z kuzovi, g'ildirak bazasi, chiroqlari, dvigatel ovozi (balandligi va tembri) va boshqaruvi bor.
- **Kabina:** hamma mashinalarda bitta kabina dizayni, har bir mashina o'lchamiga moslab kichraytirilgan. Har bir modelning o'z kabinasi hali yo'q.
- **Tariflar:** o'yin uchun taxminiy, haqiqiy taksi narxlari emas.
- **Ko'chadagi oqim:** shu mashinalar yuradi, taxminan har oltinchisi tomida TAKSI belgisi bilan.

## Tezlik
- **MacBook** (Claude ilovasidagi brauzer paneli, 2048×1152 render, "high" sozlama, 9 katak, 19 ta mashina, haydash paytida): o'rtacha 120 FPS, 99% kadrlar 9,3 ms'dan tez.
- **Android telefon:** qo'limda yo'q, telefonda o'lchanmagan.

## Diqqatga sazovor joylar
| Joy | Holati |
|---|---|
| Teleminora, Minor masjidi, Chorsu bozori, Ko'kaldosh madrasasi, Mustaqillik maydoni (Ezgulik ravog'i), Toshkent City, Amir Temur muzeyi, "O'zbekiston" mehmonxonasi, Humo Arena | Alohida modellar haqiqiy joyida (OSM'dan), eng yaqin katta ko'chaga qaragan |
| Hazrati Imom majmuasi, Amir Temur haykali | Yangi soddalashtirilgan modellar |
| Boshqa barcha binolar | OSM konturidan ko'tarilgan (bino turiga qarab fasad) |

## Ma'lum kamchiliklar
- Yer tekis. Ko'prik va tunnellar ko'cha sathida chiziladi, faqat marshrut grafida ular alohida turadi.
- Binolar balandligining ko'pi taxmin.
- Mahalla hovli devorlari va darvozalari OSM'da deyarli yo'q, shuning uchun qo'shilmadi.
- Ba'zi ko'cha nomlari OSM'da faqat ruscha (masalan, "Изза улица"), o'yinda ham shunday ko'rinadi.
- Ko'chadagi mashinalar svetofor va oldidagi mashinaga qarab to'xtaydi, lekin qatorni almashtirmaydi.
- Uchtepa tumanida OSM'da metro bekati belgilanmagan.
- Kechki yorug'lik, ho'l asfalt va faralar ustida bu safar ishlanmadi, faqat kunduzgi ko'rinish yaxshilandi.
