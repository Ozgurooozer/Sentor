# Agentic Elektrik Devresi (Circuit Logic)

Bu mimari, zekayı bir **"Sinyal"** ve ajanları birer **"Devre Elemanı"** olarak ele alır.

## Devre Elemanları

### 1. DecisionGate (Mantık Kapısı)
- Sinyali alır ve belirli bir AI kriterine göre (örn: "Bu güvenli mi?") akışa izin verir veya akışı keser.
- Devredeki bir **Sigorta** veya **Diyot** gibi çalışır.

### 2. AITransformer (Güçlendirici/Trafo)
- Gelen ham veriyi AI talimatlarıyla işler ve daha yüksek "voltajlı" (daha işlenmiş/değerli) bir sinyale dönüştürür.
- Bir **Transformatör** gibi çalışır.

### 3. Signal (Sinyal)
- Devre boyunca taşınan veri paketidir.
- `voltage` değeri, sinyalin önemini veya AI tarafından işlenme derecesini temsil eder.

## Avantajları
- **Hata Toleransı:** Bir kapı (gate) sinyali kestiğinde, tüm devre güvenli bir şekilde durur.
- **Modülerlik:** Yeni bileşenler (örn: `DatabaseCapacitor`, `WebResistor`) ekleyerek karmaşık sistemler kurulabilir.
- **Görselleştirme:** Sinyalin devre üzerindeki hareketi kolayca izlenebilir ve debug edilebilir.
