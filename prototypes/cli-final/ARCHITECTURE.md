# Manus Infinite Canvas & Node Engine Mimarisi

Bu proje, agentic sistemleri statik scriptlerden kurtarıp dinamik, görselleştirilebilir ve sonsuz genişleyebilir bir "Node Graph" yapısına taşımayı hedefler.

## Temel Bileşenler

### 1. Sonsuz Kanvas (Infinite Canvas)
- `Canvas` sınıfı, düğümler (nodes) ve aralarındaki bağlantıları (connections) yönetir.
- Bir kanvas, başka bir kanvasın içinde bir düğüm (`CanvasNode`) olarak yer alabilir. Bu, **recursive (özyinelemeli)** bir derinlik sağlar.

### 2. Olay Tabanlı I/O (Event-driven I/O)
- Her düğümün girişi (`input`) ve çıkışı (`output`) vardır.
- Düğümler arası iletişim `portMap` üzerinden yapılır. Bir düğümün çıkışı, diğerinin girişine bağlanır.
- `EventEmitter` kullanılarak sistemin her adımında olaylar fırlatılır (nodeAdded, nodeExecuted vb.).

### 3. Zeki Blueprints (Blueprints)
- Karmaşık iş akışlarını (örneğin: "Hata Ayıklama Akışı", "Kod Yazma Akışı") tek tıkla oluşturmak için kullanılan şablonlardır.

## Örnek Akış
1. **AI Node:** Kullanıcıdan gelen isteği alır ve gerekli shell komutuna karar verir.
2. **Shell Node:** AI'dan gelen komutu alır ve terminalde çalıştırır.
3. **Canvas Node:** Bu iki adımı içeren yapıyı paketleyip daha büyük bir projede tek bir "Ajan" düğümü olarak kullanmanızı sağlar.

## Gelecek Vizyonu
- Bu mimari, terminal üzerinde ASCII veya TUI (Terminal UI) ile görselleştirilerek gerçek bir "Sonsuz Tuval" deneyimi sunacaktır.

### 4. CodeGraph Sentezi (Semantik Zeka)
- `CodeGraph` entegrasyonu sayesinde düğümler artık sadece metin tabanlı değil, kodun semantik yapısını (callers, callees, impact) anlayarak çalışır.
- `CodeGraphSearchNode` ile tüm proje bilgisini (knowledge graph) bağlama dahil edebilirsiniz.
- `CodeGraphRelationNode` ile bir değişikliğin projenin hangi kısımlarını etkileyeceğini (impact analysis) otonom olarak analiz edebilirsiniz.
