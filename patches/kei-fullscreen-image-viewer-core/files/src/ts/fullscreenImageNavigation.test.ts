import { describe, expect, it } from 'vitest'
import {
  getFullscreenImageAction,
  getGalleryNeighborIndex,
} from './fullscreenImageNavigation'

describe('fullscreen image keyboard navigation', () => {
  it('closes on Escape independently of gallery position', () => {
    expect(getFullscreenImageAction('Escape', false, false)).toBe('close')
  })

  it('moves only toward an available neighbor', () => {
    expect(getFullscreenImageAction('ArrowLeft', true, false)).toBe('previous')
    expect(getFullscreenImageAction('ArrowLeft', false, true)).toBeNull()
    expect(getFullscreenImageAction('ArrowRight', false, true)).toBe('next')
    expect(getFullscreenImageAction('ArrowRight', true, false)).toBeNull()
    expect(getFullscreenImageAction('Enter', true, true)).toBeNull()
  })
})

describe('fullscreen image sparse gallery navigation', () => {
  const imageIndexes = [0, 2, 5]

  it('skips non-image assets between image indexes', () => {
    expect(getGalleryNeighborIndex(imageIndexes, 2, -1)).toBe(0)
    expect(getGalleryNeighborIndex(imageIndexes, 2, 1)).toBe(5)
  })

  it('stops at both boundaries and rejects an unknown current index', () => {
    expect(getGalleryNeighborIndex(imageIndexes, 0, -1)).toBeNull()
    expect(getGalleryNeighborIndex(imageIndexes, 5, 1)).toBeNull()
    expect(getGalleryNeighborIndex(imageIndexes, 1, 1)).toBeNull()
  })
})
