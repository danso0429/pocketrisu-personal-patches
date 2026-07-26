export type WhenMode = 'normal' | 'keep' | 'legacy'

export interface WhenExpressionLookups {
  getChatVar: (name: string) => string
  getGlobalToggle: (name: string) => string
}

export interface WhenExpressionResult {
  condition: string
  mode: WhenMode
}

const isTruthy = (value: string | undefined): boolean =>
  value === 'true' || value === '1'

function evaluateRightToLeft(
  input: string[],
  lookups: WhenExpressionLookups
): WhenExpressionResult {
  const statement = [...input]
  let mode: WhenMode = 'normal'

  while (statement.length > 1) {
    const condition = statement.pop()
    const operator = statement.pop()

    switch (operator) {
      case 'not':
        statement.push(isTruthy(condition) ? '0' : '1')
        break
      case 'keep':
        mode = 'keep'
        statement.push(condition ?? '')
        break
      case 'legacy':
        mode = 'legacy'
        statement.push(condition ?? '')
        break
      case 'and': {
        const condition2 = statement.pop()
        statement.push(isTruthy(condition) && isTruthy(condition2) ? '1' : '0')
        break
      }
      case 'or': {
        const condition2 = statement.pop()
        statement.push(isTruthy(condition) || isTruthy(condition2) ? '1' : '0')
        break
      }
      case 'is': {
        const condition2 = statement.pop()
        statement.push(condition === condition2 ? '1' : '0')
        break
      }
      case 'isnot': {
        const condition2 = statement.pop()
        statement.push(condition !== condition2 ? '1' : '0')
        break
      }
      case 'var':
        statement.push(isTruthy(lookups.getChatVar(condition ?? '')) ? '1' : '0')
        break
      case 'toggle':
        statement.push(isTruthy(lookups.getGlobalToggle(condition ?? '')) ? '1' : '0')
        break
      case 'vis': {
        const variable = lookups.getChatVar(statement.pop() ?? '')
        statement.push(variable === condition ? '1' : '0')
        break
      }
      case 'visnot': {
        const variable = lookups.getChatVar(statement.pop() ?? '')
        statement.push(variable !== condition ? '1' : '0')
        break
      }
      case 'tis': {
        const variable = lookups.getGlobalToggle(statement.pop() ?? '')
        statement.push(variable === condition ? '1' : '0')
        break
      }
      case 'tisnot': {
        const variable = lookups.getGlobalToggle(statement.pop() ?? '')
        statement.push(variable !== condition ? '1' : '0')
        break
      }
      case '>': {
        const condition2 = statement.pop()
        statement.push(parseFloat(condition2 ?? '') > parseFloat(condition ?? '') ? '1' : '0')
        break
      }
      case '<': {
        const condition2 = statement.pop()
        statement.push(parseFloat(condition2 ?? '') < parseFloat(condition ?? '') ? '1' : '0')
        break
      }
      case '>=': {
        const condition2 = statement.pop()
        statement.push(parseFloat(condition2 ?? '') >= parseFloat(condition ?? '') ? '1' : '0')
        break
      }
      case '<=': {
        const condition2 = statement.pop()
        statement.push(parseFloat(condition2 ?? '') <= parseFloat(condition ?? '') ? '1' : '0')
        break
      }
      default:
        statement.push(isTruthy(condition) ? '1' : '0')
        break
    }
  }

  return {
    condition: statement[0] ?? '0',
    mode,
  }
}

export function evaluateWhenExpression(
  statement: string[],
  lookups: WhenExpressionLookups
): WhenExpressionResult {
  if (!statement.some((token) => token === 'and' || token === 'or')) {
    return evaluateRightToLeft(statement, lookups)
  }

  const segments: string[][] = [[]]
  const logicalOperators: Array<'and' | 'or'> = []
  for (const token of statement) {
    if (token === 'and' || token === 'or') {
      logicalOperators.push(token)
      segments.push([])
    } else {
      segments[segments.length - 1].push(token)
    }
  }

  if (segments.some((segment) => segment.length === 0)) {
    return evaluateRightToLeft(statement, lookups)
  }

  const atoms = segments.map((segment) => evaluateRightToLeft(segment, lookups))
  let condition = atoms[atoms.length - 1].condition
  for (let index = logicalOperators.length - 1; index >= 0; index -= 1) {
    const left = atoms[index].condition
    condition = logicalOperators[index] === 'and'
      ? (isTruthy(left) && isTruthy(condition) ? '1' : '0')
      : (isTruthy(left) || isTruthy(condition) ? '1' : '0')
  }

  return {
    condition,
    mode: atoms.find((atom) => atom.mode !== 'normal')?.mode ?? 'normal',
  }
}
