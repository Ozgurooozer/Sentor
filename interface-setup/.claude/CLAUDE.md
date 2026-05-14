# Claude Code — Global Design System

Bu dosya her oturumda otomatik okunur. Tasarım kararları buraya göre verilir.

---

## Stack
- **HTML5 + Tailwind CSS** (CDN, dependency yok)
- Vanilla JS (framework yok, sade kalır)
- Tek dosya tercih edilir (`index.html` içinde style + script)

## Felsefe
- Az satır > çok satır
- Okunabilir > akıllı
- Çalışan > mükemmel
- Her component üretmeden önce kararı açıkla, onay al

## Tasarım Sistemi
Her oturumda `.interface-design/system.md` dosyasını oku.
Yoksa `/interface-design:init` komutunu çalıştır.

## Kurallar
1. Tailwind utility class dışında custom CSS yazma (zorunlu değilse)
2. Her yeni component için spacing, renk, depth kararını söyle
3. Tutarsızlık görürsen uyar
4. Gereksiz dependency önerme
