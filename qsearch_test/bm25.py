"""BM25 baseline — Okapi BM25 (Robertson 1994)."""

import math
import re
from collections import Counter


def tokenize(text: str) -> list[str]:
    return re.findall(r"\b[a-z]{2,}\b", text.lower())


class BM25:
    def __init__(self, corpus: list[dict], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.docs = corpus
        self.N = len(corpus)
        self.tokenized = [tokenize(d["text"]) for d in corpus]
        self.avgdl = sum(len(t) for t in self.tokenized) / max(self.N, 1)
        self.df: Counter = Counter()
        for tokens in self.tokenized:
            self.df.update(set(tokens))

    def idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        return math.log((self.N - df + 0.5) / (df + 0.5) + 1)

    def score(self, query: str, doc_idx: int) -> float:
        q_terms = tokenize(query)
        doc_tokens = self.tokenized[doc_idx]
        tf_counter = Counter(doc_tokens)
        dl = len(doc_tokens)
        score = 0.0
        for term in q_terms:
            tf = tf_counter.get(term, 0)
            if tf == 0:
                continue
            tf_norm = tf * (self.k1 + 1) / (
                tf + self.k1 * (1 - self.b + self.b * dl / self.avgdl)
            )
            score += self.idf(term) * tf_norm
        return score

    def rank(self, query: str) -> list[tuple[int, float]]:
        scores = [(i, self.score(query, i)) for i in range(self.N)]
        return sorted(scores, key=lambda x: -x[1])
