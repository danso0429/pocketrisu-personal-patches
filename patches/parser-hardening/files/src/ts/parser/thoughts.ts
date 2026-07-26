const OPEN_THOUGHTS = '<Thoughts>'
const CLOSE_THOUGHTS = '</Thoughts>'

export interface ExtractThoughtsResult {
  content: string
  thoughts: string[]
}

export function extractThoughts(input: string): ExtractThoughtsResult {
  const thoughts: string[] = []
  let content = ''
  let cursor = 0

  while (cursor < input.length) {
    const open = input.indexOf(OPEN_THOUGHTS, cursor)
    if (open === -1) {
      content += input.slice(cursor)
      break
    }

    content += input.slice(cursor, open)
    const thoughtStart = open + OPEN_THOUGHTS.length
    let scan = thoughtStart
    let depth = 1
    let close = -1

    while (scan < input.length) {
      const nextOpen = input.indexOf(OPEN_THOUGHTS, scan)
      const nextClose = input.indexOf(CLOSE_THOUGHTS, scan)
      if (nextClose === -1) break

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1
        scan = nextOpen + OPEN_THOUGHTS.length
        continue
      }

      depth -= 1
      if (depth === 0) {
        close = nextClose
        break
      }
      scan = nextClose + CLOSE_THOUGHTS.length
    }

    if (close === -1) {
      content += input.slice(open)
      break
    }

    const thought = input.slice(thoughtStart, close)
    if (thought.length > 0) thoughts.push(thought)
    cursor = close + CLOSE_THOUGHTS.length
  }

  return { content, thoughts }
}
