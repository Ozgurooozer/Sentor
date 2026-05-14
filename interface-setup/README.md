# Claude Code — Interface Design Altyapısı

OS/System UI tonu, HTML + Tailwind, sade ve elegant.

---

## Kurulum (tek sefer)

```bash
chmod +x install.sh
./install.sh
```

Bu kadar. Global `~/.claude/` klasörüne kurulur, her projede çalışır.

---

## Kullanım (her yeni projede)

```bash
cd proje-klasorum
claude --dangerously-skip-permissions
```

İçinde:

```
/interface-design:status
```
→ sistem yüklü mü kontrol et

```
/interface-design:init
```
→ projeye özel başlat, Claude tasarım kararlarını açıklar

---

## Ne içeriyor?

| Dosya | Ne işe yarıyor |
|---|---|
| `.claude/CLAUDE.md` | Claude'un her oturumda okuduğu global kurallar |
| `.interface-design/system.md` | Renk, tipografi, spacing, component sistemi |
| `install.sh` | Her şeyi `~/.claude/` a kopyalar |

---

## Tasarım sistemi özeti

- **Ton:** OS-native, dark, minimal
- **Renkler:** #0a0a0a base, #5b8def accent
- **Font:** system-ui (import yok)
- **Derinlik:** border-only (shadow yok)
- **Spacing:** 4px base grid
- **Animasyon:** 150ms ease-out
