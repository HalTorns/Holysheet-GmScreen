export type DiceExpression = { count: number; sides: number; modifier: number }
export function parseDice(expression: string): DiceExpression | null {
  if (expression.length > 40) return null
  const match = /^\s*(\d+)\s*[dD]\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(
    expression
  )
  if (!match) return null
  const count = Number(match[1])
  const sides = Number(match[2])
  const modifier = Number(match[4] ?? 0) * (match[3] === '-' ? -1 : 1)
  if (
    count < 1 ||
    count > 100 ||
    sides < 2 ||
    sides > 1000 ||
    Math.abs(modifier) > 10_000
  )
    return null
  return { count, sides, modifier }
}
// The source supplies unsigned 32-bit words; rejection avoids modulo bias.
export function rollDice(expression: string, randomWord: () => number) {
  const parsed = parseDice(expression)
  if (!parsed) throw new Error('Expression de dés invalide.')
  const limit = Math.floor(4_294_967_296 / parsed.sides) * parsed.sides
  const rolls: number[] = []
  for (let die = 0; die < parsed.count; die++) {
    let accepted = false
    for (let attempt = 0; attempt < 128; attempt++) {
      const word = randomWord()
      if (!Number.isInteger(word) || word < 0 || word >= 4_294_967_296)
        throw new Error('Source aléatoire invalide.')
      if (word < limit) {
        rolls.push((word % parsed.sides) + 1)
        accepted = true
        break
      }
    }
    if (!accepted) throw new Error('Source aléatoire indisponible.')
  }
  return {
    rolls,
    total: rolls.reduce((sum, value) => sum + value, parsed.modifier),
  }
}
