"use client";

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { mangaGestureAction } from '@/lib/manga-gesture';

// One pointer sequence owns one action. Native vertical scrolling and pinch zoom
// stay enabled; cancellation or a second finger invalidates the whole sequence.
export function MangaTouchSurface({ direction, onNext, onPrevious, onToggle, children }: {
  direction: 'rtl' | 'ltr'; onNext(): void; onPrevious(): void; onToggle(): void; children: ReactNode;
}) {
  const pointers = useRef(new Set<number>());
  const gesture = useRef<{id: number; x: number; y: number; time: number; distance: number} | null>(null);
  const zoomed = () => Math.abs((window.visualViewport?.scale ?? 1) - 1) > 0.01;
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (g?.id === e.pointerId) g.distance = Math.max(g.distance, Math.hypot(e.clientX - g.x, e.clientY - g.y));
  };
  return <section aria-label="منطقة تقليب صفحات المانجا" className="w-full select-none" style={{ touchAction: 'pan-y pinch-zoom' }}
    onDragStart={e => e.preventDefault()}
    onPointerDown={e => {
      pointers.current.add(e.pointerId);
      if (pointers.current.size !== 1 || !e.isPrimary || e.button !== 0 || zoomed() ||
        (e.target instanceof Element && e.target.closest('button, a, input, select, textarea, [role="alert"], [role="dialog"]'))) {
        gesture.current = null; return;
      }
      gesture.current = {id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, distance: 0};
    }}
    onPointerMove={move}
    onPointerCancel={e => { pointers.current.delete(e.pointerId); gesture.current = null; }}
    onPointerLeave={e => { if (e.pointerType === 'mouse') { pointers.current.delete(e.pointerId); gesture.current = null; } }}
    onPointerUp={e => {
      move(e);
      const g = gesture.current;
      pointers.current.delete(e.pointerId);
      gesture.current = null;
      if (!g || g.id !== e.pointerId || zoomed()) return;
      const rect = (e.currentTarget.querySelector('[data-manga-page]') ?? e.currentTarget).getBoundingClientRect();
      const action = mangaGestureAction({startX: g.x, startY: g.y, endX: e.clientX, endY: e.clientY,
        left: rect.left, width: rect.width, duration: e.timeStamp - g.time, maxDistance: g.distance, direction});
      if (action === 'next') onNext();
      if (action === 'previous') onPrevious();
      if (action === 'toggle') onToggle();
    }}>
    {children}
  </section>;
}
