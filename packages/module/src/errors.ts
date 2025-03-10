import { security } from '.'
import { decoding, validation } from '@mondrian-framework/model'

export class UnauthorizedAccess extends Error {
  public readonly error: security.PolicyViolation
  constructor(error: security.PolicyViolation) {
    super(`Unauthorized access.`)
    this.error = error
  }
}

export class InvalidOutputValue extends Error {
  public readonly errors: validation.Error[] | decoding.Error[]
  constructor(functionName: string, errors: validation.Error[] | decoding.Error[]) {
    super(
      `Invalid output on function ${functionName}. Errors: ${errors
        .map((v, i) => `(${i + 1}) ${JSON.stringify(v)}`)
        .join('; ')}`,
    )
    this.errors = errors
  }
}

export class MaxSelectionDepthReached extends Error {
  public readonly maxDepth: number
  public readonly depth: number
  constructor(depth: number, maxDepth: number) {
    super(`Max selection depth reached: requested selection have a depth of ${depth}. The maximum is ${maxDepth}.`)
    this.maxDepth = maxDepth
    this.depth = depth
  }
}
