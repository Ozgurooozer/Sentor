# Design System — OS / System UI

Oluşturulma: İlk kurulum
Ton: OS-native, dark, minimal, elegant
Stack: HTML + Tailwind CSS

---

## Renk Tokenleri

| Token         | Değer       | Kullanım                          |
|---------------|-------------|-----------------------------------|
| bg-base       | #0a0a0a     | Ana arka plan                     |
| bg-surface    | #111111     | Card, panel yüzeyleri             |
| bg-elevated   | #1a1a1a     | Hover, dropdown, modal            |
| bg-overlay    | #222222     | Tooltip, context menu             |
| border-subtle | #2a2a2a     | Sessiz border                     |
| border-active | #404040     | Focus, hover border               |
| text-primary  | #f5f5f5     | Ana metin                         |
| text-secondary| #888888     | Açıklama, placeholder             |
| text-tertiary | #555555     | Devre dışı, meta                  |
| accent        | #5b8def     | CTA, link, aktif state            |
| accent-hover  | #4a7de0     | Accent hover                      |
| success       | #3ecf8e     | Başarı                            |
| warning       | #f5a623     | Uyarı                             |
| danger        | #e05c5c     | Hata, silme                       |

---

## Tipografi

- **Font:** `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Monospace: `'SF Mono', 'Fira Code', monospace`

| Seviye     | Boyut   | Ağırlık | Letter-spacing |
|------------|---------|---------|----------------|
| Display    | 2rem    | 600     | -0.02em        |
| Heading    | 1.25rem | 600     | -0.01em        |
| Body       | 0.875rem| 400     | 0              |
| Small      | 0.75rem | 400     | 0.01em         |
| Mono       | 0.8rem  | 400     | 0              |

---

## Spacing Sistemi (4px base)

```
1 = 4px   2 = 8px   3 = 12px   4 = 16px
5 = 20px  6 = 24px  8 = 32px   10 = 40px
12 = 48px 16 = 64px
```

Tailwind karşılıkları: `p-1`, `p-2`, `p-3` ... olarak kullan.

---

## Depth Stratejisi (Border-only, shadow yok)

OS UI felsefesi: gölge değil, border ile derinlik.

```
Seviye 0 → bg-base     + border yok
Seviye 1 → bg-surface  + border border-subtle
Seviye 2 → bg-elevated + border border-subtle
Seviye 3 → bg-overlay  + border border-active
```

`box-shadow` kullanma. Tek istisna: focus ring (`ring-2 ring-accent/40`).

---

## Component Kuralları

### Button
```
Primary:   bg-accent text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-accent-hover
Secondary: bg-transparent border border-border-subtle text-primary px-4 py-2 rounded-md text-sm hover:border-border-active
Ghost:     bg-transparent text-secondary px-4 py-2 rounded-md text-sm hover:text-primary hover:bg-elevated
```

### Input
```
bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm text-primary
placeholder:text-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
```

### Card
```
bg-surface border border-border-subtle rounded-lg p-4
hover state: border-border-active (transition)
```

### Badge
```
Neutral: bg-elevated text-secondary text-xs px-2 py-0.5 rounded-full
Accent:  bg-accent/10 text-accent text-xs px-2 py-0.5 rounded-full
```

---

## Animasyon

- Transition süresi: `150ms` (hızlı, OS-native hissi)
- Easing: `ease-out`
- Tailwind: `transition-colors duration-150`
- Karmaşık animasyon kullanma

---

## Layout

- Max genişlik: `max-w-5xl mx-auto` (içerik alanı)
- Padding: `px-6` (mobil), `px-8` (desktop)
- Grid gap: `gap-4` veya `gap-6`
- Sidebar varsa: `w-56` sabit, içerik `flex-1`

---

## Yapılmayacaklar

- ❌ Gradient background (tek renk tercih et)
- ❌ Box shadow (border kullan)
- ❌ Renkli büyük bloklar
- ❌ Google Fonts import (system font kullan)
- ❌ Animate.css veya harici kütüphane
- ❌ Fazla border-radius (max `rounded-lg`)
