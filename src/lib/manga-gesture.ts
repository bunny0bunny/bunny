type Gesture = {
  startX: number; startY: number; endX: number; endY: number;
  left: number; width: number; duration: number; maxDistance: number;
  direction: 'rtl' | 'ltr';
};

export function mangaGestureAction(g: Gesture): 'next' | 'previous' | 'toggle' | null {
  const dx = g.endX - g.startX, dy = g.endY - g.startY;
  if (g.width <= 0 || g.duration > 1000) return null;
  if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    return (dx > 0) === (g.direction === 'rtl') ? 'next' : 'previous';
  }
  if (g.maxDistance > 8 || g.duration > 350) return null;
  const position = (g.endX - g.left) / g.width;
  if (position >= 0.3 && position <= 0.7) return 'toggle';
  return (position < 0.3) === (g.direction === 'rtl') ? 'next' : 'previous';
}
