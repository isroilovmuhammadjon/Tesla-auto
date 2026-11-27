# Toshkent 1:1 — ish holati (keyingi sessiya shu yerdan davom etadi)

Branch: `feature/toshkent-1to1` (main'ga qo'shilmagan, foydalanuvchi tasdig'ini kutadi).
Preview: https://isroilovmuhammadjon.github.io/Tesla-auto/preview/feature-toshkent-1to1/ (`.github/workflows/preview.yml` har push'da yangilaydi).
To'liq natijalar: `docs/TOSHKENT-1TO1.md`.

## Bajarildi
1. **Geometriya** (`check_geometry.py`):

   | Tekshiruv | Oldin | Keyin |
   |---|---|---|
   | Yo'l ustidagi binolar | 3 468 | 581 |
   | Devorlar | 270 | 0 |
   | Darvozalar | 998 | 0 |
   | Bino ichidagi bordyurlar | 1 465 | 284 |

2. **Haqiqiy va o'yin ko'rinishlari:** 3 ta Commons surati (Sayilgoh, kurantlar, Amir Temur xiyoboni) uchun oldin/keyin rasmlari `docs/matched/`'da.
   - Qo'shildi: Forumlar saroyi va kurantlar modellari, OSM material va tom shakli, daraxtlar konturga qarab qoldiriladi.
   - `PHOTO-NEEDS.csv`: 9 413 ko'rinish nuqtasi, 3 tasida surat bor.
3. **Mashinalar:** har model uchun orqa chiroqlar, orqaga yurish chiroqlari, xrom chiziq, raqam belgisi; kuzov shakli, shina va disklar.
4. **Uzluksiz haydovlar va smena:**
   - 5 ta HUD o'chiq haydov, hammasi manzilga yetdi, tiqilish 0.
   - To'liq taksi safari: Enter bilan qabul, to'g'ri bordyur, noto'g'ri burilish va qayta hisoblash, bir marta to'lov, sahifa yangilangandan keyin balans saqlangan.
5. **Oqim tuzatishlari:**
   - bitta chorrahada bitta svetofor fazasi;
   - kesishuvchi mashinalarning o'zaro kutishi yo'q;
   - to'planish va "boshma-bosh" qulf yo'q;
   - parallel yo'lda marshrut qayta hisoblanadi.
6. **Test vositalari** (faqat `?test` bilan): `__testDrive`, `__testShift`, `__viewAt`.

## BIRINCHI TUGALLANMAGAN VAZIFA
- Ikki tomonlama yo'llarning mediana tomonida qolgan 23 bekatni o'ng bordyurga o'tkazish. Ro'yxat `docs/geom-check.json` → `objects_on_carriageway_list`. `faceRoad` bekatni yo'nalish bo'yicha o'ng tomondagi trotuarga qo'yishi kerak.
- So'ng qolgan 581 bino kesishmasini ko'rib chiqish (`buildings_on_carriageway`).

## Keyingi navbat
1. Tor mahalla ko'chalarida taksi: `__testShift` tiqilishlarini kamaytirish (burilish radiusi, yo'lak kengligi).
2. Kabina ichida kameraning bekat shisha devoridan o'tishini to'xtatish (Yangi Toshkentda ko'rilgan kulrang parda).
3. Kurantlar: arkali derazalar, atrofdagi katta daraxtlar.
4. Old chiroqlar va kabinalar har model uchun alohida.
5. **Suratlar:** Mapillary client token kerak (foydalanuvchidan; tokenni repoga yoki brauzer kodiga yozmaslik, faqat lokal skriptda ishlatish). `PHOTO-NEEDS.csv` bo'yicha tumanlarda surat yig'ish va fasad, do'kon, belgilarni moslash.
6. Foydalanuvchi tasdiqlagach: `main`'ga birlashtirish (main'dagi `pages.yml` preview'larni saqlaydigan qilib yangilangan).

## Ma'lumot
- OSM: Geofabrik Uzbekistan 2026-11-27. Xom ma'lumot `~/street-racing-3d-data/raw2.pkl` (`extract.py`), xarita `build.py` bilan quriladi.
- Map versiyasi `osmcity.js` → `MAP_VER` (har qayta qurishda oshiriladi).
- Mos suratlar: `~/street-racing-3d-data/refs/refs.json`.
