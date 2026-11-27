# Toshkent 1:1 — ish holati (keyingi sessiya shu yerdan davom etadi)

Branch: `feature/toshkent-1to1` (main'ga hali qo'shilmagan).

## Bajarildi
- Audit skripti: `scripts/tashkent-map/audit.py` (tumanlar bo'yicha: yo'llar, ulanish, uzilgan kesishmalar, binolar, bekatlar, metro, devorlar, daraxtlar).
- OSM qayta ajratildi (`extract.py`): qatorlar, burilish taqiqlari, devor/panjara, darvoza, eshik, daraxt, yerdan foydalanish.
- Xarita (`build.py`):
  - xususiy yo'laklar grafga qo'shildi (ulanmagan tugunlar 1 443 → 1 170);
  - 371 burilish taqiqi, 3 711 mediana, 3 595 zebra;
  - 5 146 devor qismi, 1 507 darvoza, 4 430 eshik, 16 457 haqiqiy daraxt, 12 728 zamin maydoni;
  - yo'l yoki ko'prik kesib o'tgan joyda devorda ochiq joy (478 ta).
- Renderer (`osmbuild.js`):
  - qatorlar soni, mediana (maysa va teraklar), 5 xil daraxt, daraxt yo'l ustida emas;
  - devor, panjara, darvoza, eshik, zebra va piyodalar belgisi, zamin turlari, 20 xil fasad.
- Marshrut (`route.js`): yo'l+yo'nalish bo'yicha qidiruv, OSM burilish taqiqlari, chap/U-burilish narxi.
- Oqim: qatorlar, chorrahada tiqilib qolmaslik, bitta chorrahada bitta svetofor fazasi.
- Mashinalar: yumaloq burun va orqa, torayuvchi oyna, haqiqiy shina va disklar.
- HUD o'chirish (H), test haydovlari (`?test`, `www/js/devtest.js`), `__viewAt` orqali surat joyidan ko'rinish.

## Qolgan ishlar (navbat bilan)
1. Test haydovlari: Bektemir → Chorsu, Yunusobod → Olmazor, Yangi Toshkent → Mirobod, O'rikzor → Tinchlik. Natijalar `docs/TOSHKENT-1TO1.md` ga yoziladi.
2. Haqiqiy va o'yin ko'rinishlari: Commons suratlari (`~/street-racing-3d-data/refs`, refs.json) → `__viewAt(lat, lon, heading)`.
3. Mapillary tokeni bo'lsa: har tumandan suratlar, fasad, do'kon va belgilarni moslashtirish.
4. Audit "keyin" holati + tumanlar bo'yicha qamrov yozuvlari (ko'cha ko'rinishi tasdiqlangan km = suratli segmentlar).
5. Taksi smenasi to'liq sinovi, telefon ko'rinishi, poyga/garaj regressiyasi; keyin main'ga chiqarish.

## Ma'lumot manbalari
- **OSM:** Geofabrik Uzbekistan, 2026-11-27; xom ma'lumot `~/street-racing-3d-data/raw2.pkl` faylida.
- **Ko'cha suratlari:**
  - KartaView API bu tarmoqdan javob bermadi;
  - Mapillary token talab qiladi (foydalanuvchidan so'ralishi kerak);
  - Commons: kam surat, ro'yxati refs.json'da.
