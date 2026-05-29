# Agent Prompt Optimization Report

Tarih: 2026-05-27
Yazar: Otomatik rapor (Copilot)

Özet
- `ide/src/modules/ai/lib/agents.ts` içindeki yerleşik ajan talimatları (Vault, Atlas-Maker, Coder, Sentor, Orkestra, Vault-Exporter) sadeleştirildi.
- Amaç: token kullanımını azaltmak, ajanların davranışını netleştirmek ve gereksiz uzun yönergelerden kaçınmak.

Yapılan değişiklikler (kısa)
- Vault: Arama → okuma → web fallback akışı netleştirildi. `vault_write` çağrısı yasaklandı; kod soruları için `code_status` önerildi.
- Atlas-Maker: Yazma akışı kısaltıldı; HTML kuralları korundu fakat talimatlar daha özlü hale getirildi. `vault_write` yalnızca kullanıcı isteğiyle kullanılmalı.
- Coder: Kod graph (CodeGraph) önceliği, `code_status` kontrolü ve küçük, güvenli diff ilkesi vurgulandı. Tür denetimi sonrası doğrulama eklendi.
- Sentor: Ajan oluşturma protokolü korundu ama YAML örneği ve uzun açıklamalar kısaltıldı; onay akışı netleştirildi.
- Orkestra: Yönlendirme kuralları sadeleştirildi; read-only görevler için `agent_invoke`, mutasyonlar için kullanıcı yönlendirmesi belirtildi.
- Vault-Exporter: Canvas→HTML dönüşümü akışı ve hata/muhtemel durumları kısaltıldı.

Neden yapıldı
- Uzun, detaylı talimatlar gereksiz token tüketimine ve daha yavaş model yanıtlarına yol açıyordu.
- Kısa ve kesin yönergeler ajanın doğru araçları tercih etmesini ve yanlışa açık işlemlere girişmemesini sağlar.

Dosyalar
- Değişiklik yapılan dosya: `ide/src/modules/ai/lib/agents.ts` (çoklu yerleşik ajan talimatları düzenlendi).
- Bu rapor: `docs/agent-prompt-optimization-report.md`

Sonraki adımlar (öneri)
1. Değişiklikleri inceleyin ve onaylayın.
2. IDE'de ajan davranışını test edin (ör. Vault aramaları, CodeGraph çağrıları).
3. İstenirse `agents.ts` içindeki daha küçük metinlerle A/B testleri yapıp performans/ödeme etkisini ölçün.

İletişim
- Bu raporu gözden geçirip onaylarsanız, isterseniz commit ve PR hazırlayabilirim.
