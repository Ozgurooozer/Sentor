"""
QSE VNE Ranker — T14 tabanlı query-document ilişki skoru.

Fikir:
  - Query terms → A register (NA qubit)
  - Concept buckets → B register (NB qubit, 2^NB durum)
  - M[b][a] = 1  iff term_a hem query'de hem doc'ta var VE bucket(term_a) == b
  - θ_a = (π/2) * normalized_tfidf_weight  (T14'teki Rx açısı)
  - T14: P_b = (1/2^NB) Σ_s (-1)^(b·s) Φ_M(s)
  - VNE = -Σ P_b log2(P_b)  →  relevance skoru

Intuition: Sorgu terimi çok farklı "kavram kovasına" dağılırsa → VNE yüksek
→ döküman sorguyu geniş kapsamıyla karşılıyor = ilgili.
"""

import re
from collections import Counter
from math import log2
import numpy as np

NB = 4          # B register boyutu: 2^4 = 16 durum (T-OPT/T-RANK'e göre makul)
MAX_NA = 12     # Performans için max A qubit sayısı


# ─── Token + bucket ──────────────────────────────────────────────────────────

def tokenize(text: str) -> list[str]:
    return re.findall(r"\b[a-z]{2,}\b", text.lower())


def bucket(term: str) -> int:
    """Deterministik hash → [0, NB) kovası. T-RANDOM-VNE'ye göre uniform dağılım iyidir."""
    h = 5381
    for c in term:
        h = ((h << 5) + h + ord(c)) & 0xFFFFFF
    return h % NB


# ─── T14 core ────────────────────────────────────────────────────────────────

def phi_M(thetas: np.ndarray, M: np.ndarray, s: np.ndarray) -> float:
    """Φ_M(s) = Π_{i: (M^T s)_i = 1} cos(θ_i)   [T14]"""
    MT_s = (M.T @ s) % 2        # GF(2) matris-vektör çarpımı
    val = 1.0
    for i, active in enumerate(MT_s):
        if active:
            val *= np.cos(thetas[i])
    return val


def t14_Pb(thetas: np.ndarray, M: np.ndarray) -> np.ndarray:
    """
    T14 Walsh-Hadamard Master:
      P_b = (1/2^NB) Σ_s (-1)^(b·s) Φ_M(s)
    Returns array of length 2^NB.
    """
    size = 2 ** NB
    # Precompute Φ_M(s) for all s
    phi_cache = np.zeros(size)
    for s_int in range(size):
        s = np.array([(s_int >> k) & 1 for k in range(NB)], dtype=int)
        phi_cache[s_int] = phi_M(thetas, M, s)

    Pb = np.zeros(size)
    for b_int in range(size):
        b = np.array([(b_int >> k) & 1 for k in range(NB)], dtype=int)
        total = 0.0
        for s_int in range(size):
            s = np.array([(s_int >> k) & 1 for k in range(NB)], dtype=int)
            sign = (-1) ** int(np.dot(b, s) % 2)
            total += sign * phi_cache[s_int]
        Pb[b_int] = max(0.0, total / size)   # sayısal küçük negatifler → 0

    # Normalize (numerik hata düzeltmesi)
    total = Pb.sum()
    if total > 1e-12:
        Pb /= total
    return Pb


def vne_from_Pb(Pb: np.ndarray) -> float:
    """VNE = -Σ P_b log2(P_b)   (T14 → H(P) adımı)"""
    h = 0.0
    for p in Pb:
        if p > 1e-15:
            h -= p * log2(p)
    return h


# ─── Ranker ──────────────────────────────────────────────────────────────────

class VNERanker:
    def __init__(self, corpus: list[dict]):
        self.corpus = corpus
        self.N = len(corpus)
        self.tokenized = [tokenize(d["text"]) for d in corpus]

        # Global IDF (T-PAULI'deki expectation değerlerini normalize eder)
        N = self.N
        df: Counter = Counter()
        for tokens in self.tokenized:
            df.update(set(tokens))
        self.idf: dict[str, float] = {}
        import math
        for term, freq in df.items():
            self.idf[term] = math.log((N - freq + 0.5) / (freq + 0.5) + 1)

        # Her döküman için term set'i önbellekle
        self.doc_sets = [set(t) for t in self.tokenized]

    def _query_terms_weights(self, query: str) -> tuple[list[str], list[float]]:
        """Query tokenları + IDF ağırlıkları. MAX_NA ile kırp."""
        q_tokens = tokenize(query)
        if not q_tokens:
            return [], []
        # Ağırlık = sorgu TF × global IDF
        tf = Counter(q_tokens)
        pairs = [(term, tf[term] * self.idf.get(term, 1.0)) for term in set(q_tokens)]
        # En ağır MAX_NA terimi al
        pairs.sort(key=lambda x: -x[1])
        pairs = pairs[:MAX_NA]
        terms = [p[0] for p in pairs]
        weights = [p[1] for p in pairs]
        return terms, weights

    def _build_M(self, query_terms: list[str], doc_set: set[str]) -> np.ndarray:
        """
        M[b][a] = 1  iff  query_terms[a] ∈ doc_set  AND  bucket(query_terms[a]) == b
        Boyut: (NB, NA)
        """
        NA = len(query_terms)
        M = np.zeros((NB, NA), dtype=int)
        for a, term in enumerate(query_terms):
            if term in doc_set:
                b = bucket(term)
                M[b][a] = 1
        return M

    def score(self, query: str, doc_idx: int) -> float:
        """VNE relevance skoru (0 = alakasız, NB = maksimum T-RANK üst sınırı)"""
        terms, weights = self._query_terms_weights(query)
        if not terms:
            return 0.0
        M = self._build_M(terms, self.doc_sets[doc_idx])
        if M.sum() == 0:   # T17: M=0 → VNE=0 (blindness condition)
            return 0.0
        # θ ∈ [0, π/2]: T-OPT teoremi → θ=π/2 max VNE üretir
        max_w = max(weights)
        thetas = np.array([np.pi / 2 * (w / max_w) for w in weights])
        Pb = t14_Pb(thetas, M)
        return vne_from_Pb(Pb)

    def rank(self, query: str) -> list[tuple[int, float]]:
        scores = [(i, self.score(query, i)) for i in range(self.N)]
        return sorted(scores, key=lambda x: -x[1])
