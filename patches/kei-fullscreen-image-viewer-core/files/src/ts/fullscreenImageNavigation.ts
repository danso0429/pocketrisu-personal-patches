export type FullscreenImageAction = 'close' | 'previous' | 'next'

export function getFullscreenImageAction(
  key: string,
  canGoPrevious: boolean,
  canGoNext: boolean,
): FullscreenImageAction | null {
  if (key === 'Escape') return 'close'
  if (key === 'ArrowLeft' && canGoPrevious) return 'previous'
  if (key === 'ArrowRight' && canGoNext) return 'next'
  return null
}

export function getGalleryNeighborIndex(
  indexes: readonly number[],
  currentIndex: number,
  direction: -1 | 1,
): number | null {
  const position = indexes.indexOf(currentIndex)
  if (position < 0) return null
  return indexes[position + direction] ?? null
}
