/**
 * useAutoScroll Hook
 *
 * Auto-scrolls container to bottom when content changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVATION_THRESHOLD = 50;
const MIN_SCROLL_UP_THRESHOLD = 10;

export function useAutoScroll(dependencies: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousScrollTop = useRef<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const shouldAutoScrollRef = useRef(shouldAutoScroll);
  shouldAutoScrollRef.current = shouldAutoScroll;

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isOverscrolling = scrollTop < 0 || scrollTop + clientHeight > scrollHeight + 1;
      if (isOverscrolling) return;

      const distanceFromBottom = Math.abs(scrollHeight - scrollTop - clientHeight);
      const isScrollingUp = previousScrollTop.current !== null
        ? scrollTop < previousScrollTop.current
        : false;
      const scrollUpDistance = previousScrollTop.current !== null
        ? previousScrollTop.current - scrollTop
        : 0;
      const isDeliberateScrollUp = isScrollingUp && scrollUpDistance > MIN_SCROLL_UP_THRESHOLD;
      const isScrolledToBottom = distanceFromBottom < ACTIVATION_THRESHOLD;

      if (isDeliberateScrollUp && !isScrolledToBottom) {
        setShouldAutoScroll(false);
      } else if (!isScrollingUp || isScrolledToBottom) {
        setShouldAutoScroll(isScrolledToBottom);
      }
      previousScrollTop.current = scrollTop;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    setShouldAutoScroll(false);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      previousScrollTop.current = containerRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let previousHeight = container.scrollHeight;
    const ro = new ResizeObserver(() => {
      const currentHeight = container.scrollHeight;
      if (shouldAutoScrollRef.current && currentHeight > previousHeight) {
        scrollToBottom();
      }
      previousHeight = currentHeight;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { containerRef, scrollToBottom, handleScroll, shouldAutoScroll, handleTouchStart };
}
