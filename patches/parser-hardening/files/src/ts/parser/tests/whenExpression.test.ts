import { describe, expect, test } from 'vitest'
import { evaluateWhenExpression } from '../whenExpression'

const lookups = {
  getChatVar: (name: string) => name,
  getGlobalToggle: (name: string) => name,
}

describe('evaluateWhenExpression', () => {
  test('evaluates comparison operands before logical operators', () => {
    expect(
      evaluateWhenExpression(
        ['3', 'tis', '3', 'or', '7', 'tis', '7'],
        lookups
      )
    ).toEqual({ condition: '1', mode: 'normal' })
  })

  test('keeps right-to-left evaluation between and/or operators', () => {
    expect(
      evaluateWhenExpression(['0', 'and', '1', 'or', '1'], lookups)
    ).toEqual({ condition: '0', mode: 'normal' })
  })

  test('binds unary not inside its logical operand', () => {
    expect(
      evaluateWhenExpression(['0', 'or', 'not', 'false'], lookups)
    ).toEqual({ condition: '1', mode: 'normal' })
  })

  test('preserves whitespace modes while evaluating an operand', () => {
    expect(
      evaluateWhenExpression(
        ['keep', '3', 'tis', '3', 'and', '7', 'tisnot', '8'],
        lookups
      )
    ).toEqual({ condition: '1', mode: 'keep' })
  })
})
