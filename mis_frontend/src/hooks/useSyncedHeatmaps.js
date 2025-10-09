import { useCallback, useRef, useState } from "react";

export default function useSyncedHeatmaps() {
  const topWrapRef = useRef(null);
  const bottomWrapRef = useRef(null);
  const barRef = useRef(null);
  const topImgRef = useRef(null);
  const bottomImgRef = useRef(null);
  const [contentW, setContentW] = useState(2000);

  const updateContentWidth = useCallback(() => {
    const tw = topImgRef.current?.naturalWidth || 0;
    const bw = bottomImgRef.current?.naturalWidth || 0;
    const maxW = Math.max(tw, bw, 1200);
    setContentW(maxW);
    const cur = barRef.current?.scrollLeft || 0;
    if (topWrapRef.current) topWrapRef.current.scrollLeft = cur;
    if (bottomWrapRef.current) bottomWrapRef.current.scrollLeft = cur;
  }, []);

  const onBarScroll = useCallback((e) => {
    const x = e.currentTarget.scrollLeft;
    if (topWrapRef.current) topWrapRef.current.scrollLeft = x;
    if (bottomWrapRef.current) bottomWrapRef.current.scrollLeft = x;
  }, []);

  const onImgScroll = useCallback((e) => {
    const x = e.currentTarget.scrollLeft;
    if (barRef.current && barRef.current.scrollLeft !== x) {
      barRef.current.scrollLeft = x;
    }
    if (e.currentTarget === topWrapRef.current) {
      if (bottomWrapRef.current?.scrollLeft !== x) bottomWrapRef.current.scrollLeft = x;
    } else if (e.currentTarget === bottomWrapRef.current) {
      if (topWrapRef.current?.scrollLeft !== x) topWrapRef.current.scrollLeft = x;
    }
  }, []);

  return {
    refs: { topWrapRef, bottomWrapRef, barRef, topImgRef, bottomImgRef },
    contentW,
    updateContentWidth,
    onBarScroll,
    onImgScroll,
    setContentW,
  };
}
