import { describe, expect, test } from 'vitest'
import { extractThoughts } from '../thoughts'

describe('extractThoughts', () => {
  test('extracts sibling thoughts in order and preserves visible text', () => {
    expect(
      extractThoughts(
        'Start <Thoughts>Thought 1</Thoughts> Middle <Thoughts>Thought 2</Thoughts> End'
      )
    ).toEqual({
      content: 'Start  Middle  End',
      thoughts: ['Thought 1', 'Thought 2'],
    })
  })

  test('removes empty thoughts without adding an empty thought', () => {
    expect(extractThoughts('Before<Thoughts></Thoughts>After')).toEqual({
      content: 'BeforeAfter',
      thoughts: [],
    })
  })

  test('keeps nested thought markup inside one outer thought', () => {
    expect(
      extractThoughts(
        'Before<Thoughts>Outer <Thoughts>Inner</Thoughts> tail</Thoughts>After'
      )
    ).toEqual({
      content: 'BeforeAfter',
      thoughts: ['Outer <Thoughts>Inner</Thoughts> tail'],
    })
  })

  test('preserves an unmatched opening tag and the remaining text', () => {
    expect(extractThoughts('Before<Thoughts>unfinished')).toEqual({
      content: 'Before<Thoughts>unfinished',
      thoughts: [],
    })
  })
})
