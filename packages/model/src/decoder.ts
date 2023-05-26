import { assertNever } from '@mondrian-framework/utils'
import { ArrayDecorator, Infer, LazyType, NumberType, ObjectType, StringType } from './type-system'
import { lazyToType } from './utils'

export type DecodeResult<T> =
  | { pass: true; value: T }
  | { pass: false; errors: { path?: string; error: string; value: unknown }[] }

export type DecodeOptions = { cast?: boolean; castGqlInputUnion?: boolean }
export function decode<const T extends LazyType>(
  type: T,
  value: unknown,
  opts?: DecodeOptions,
): DecodeResult<Infer<T>> {
  const result = decodeInternal(type, value, opts)
  return enrichErrors(result, '') as DecodeResult<Infer<T>>
}

function success<T>(value: T): { pass: true; value: T } {
  return { pass: true, value }
}

function errors(errors: { path?: string; error: string; value: unknown }[]): {
  pass: false
  errors: { path?: string; error: string; value: unknown }[]
} {
  return { pass: false, errors }
}

function error(
  error: string,
  value: unknown,
): {
  pass: false
  errors: { path?: string; error: string; value: unknown }[]
} {
  return { pass: false, errors: [{ error, value }] }
}

function enrichErrors<T>(result: DecodeResult<T>, key: string): DecodeResult<T> {
  if (!result.pass) {
    return errors(result.errors.map((e) => ({ ...e, path: e.path != null ? `${key}/${e.path}` : `${key}/` })))
  }
  return result
}

function concat2<V1, V2>(v1: DecodeResult<V1>, f1: (v: V1) => DecodeResult<V2>): DecodeResult<V2> {
  if (!v1.pass) {
    return v1
  }
  const v2 = f1(v1.value)
  return v2
}
function concat3<V1, V2, V3>(
  v1: DecodeResult<V1>,
  f1: (v: V1) => DecodeResult<V2>,
  f2: (v: V2) => DecodeResult<V3>,
): DecodeResult<V3> {
  if (!v1.pass) {
    return v1
  }
  const v2 = f1(v1.value)
  if (!v2.pass) {
    return v2
  }
  const v3 = f2(v2.value)
  return v3
}

function decodeInternal(type: LazyType, value: unknown, opts: DecodeOptions | undefined): DecodeResult<unknown> {
  const t = lazyToType(type)
  if (t.kind === 'string') {
    return concat2(assertString(value, opts), (value) => checkStringOptions(value, t.opts))
  } else if (t.kind === 'number') {
    return concat2(assertNumber(value, opts), (value) => checkNumberOptions(value, t.opts))
  } else if (t.kind === 'boolean') {
    return assertBoolean(value, opts)
  } else if (t.kind === 'literal') {
    if (value === t.value) {
      return success(value)
    }
    return error(`Literal ${t.value} expected`, value)
  } else if (t.kind === 'optional-decorator') {
    if (value === undefined) {
      return success(value)
    }
    const result = decodeInternal(t.type, value, opts)
    if (!result.pass) {
      return result.errors.length > 0 ? result : error(`Undefined expected`, value)
    }
    return result
  } else if (t.kind === 'nullable-decorator') {
    if (value === null) {
      return success(value)
    }
    const result = decodeInternal(t.type, value, opts)
    if (!result.pass) {
      return result.errors.length > 0 ? result : error(`Null expected`, value)
    }
    return result
  } else if (t.kind === 'default-decorator') {
    const result = decodeInternal(t.type, value, opts)
    if (result.pass) {
      return result
    }
    if (value === undefined || (opts?.cast && value === null)) {
      return success(t.opts.default)
    }
    return result
  } else if (t.kind === 'relation-decorator') {
    return decodeInternal(t.type, value, opts)
  } else if (t.kind === 'union-operator') {
    if (opts?.castGqlInputUnion) {
      //special graphql @oneOf
      const ts = Object.entries(t.types)
      if (typeof value === 'object' && value) {
        const keys = Object.keys(value)
        const key = keys[0]
        if (keys.length === 1 && ts.some((k) => k[0] === key)) {
          return decodeInternal(t.types[key], (value as Record<string, unknown>)[key], opts)
        }
      }
      return error(`Expect exactly one of this property ${ts.map((v) => `'${v[0]}'`).join(', ')}`, value)
    } else {
      const errs: { path?: string; error: string; value: unknown }[] = []
      for (const u of Object.values(t.types)) {
        const result = decodeInternal(u, value, opts)
        if (result.pass) {
          return result
        }
        errs.push(...result.errors)
      }
      return errors(errs)
    }
  } else if (t.kind === 'object') {
    return concat3(
      assertObject(value, opts),
      (value) => checkObjectOptions(value, t.opts),
      ({ value, accumulator }) => decodeObjectProperties(value, t, accumulator, opts),
    )
  } else if (t.kind === 'array-decorator') {
    return concat3(
      assertArray(value, opts),
      (value) => checkArrayOptions(value, t.opts),
      (value) => decodeArrayElements(value, t, opts),
    )
  } else if (t.kind === 'enumerator') {
    if (typeof value !== 'string' || !t.values.includes(value)) {
      return error(`Enumerator expected (${t.values.map((v) => `"${v}"`).join(' | ')})`, value)
    }
    return success(value)
  } else if (t.kind === 'custom') {
    if (!t.is(value, t.opts)) {
      const result = t.decode(value, t.opts, opts)
      if (!result.pass) {
        return result
      }
      return result
    }
    return success(value)
  }
  assertNever(t)
}

function assertString(value: unknown, opts: DecodeOptions | undefined): DecodeResult<string> {
  if (typeof value === 'string') {
    return success(value)
  }
  if (opts?.cast) {
    if (typeof value === 'number') {
      return success(value.toString())
    }
    if (typeof value === 'boolean') {
      return success(value ? 'true' : 'false')
    }
  }
  return error(`String expected`, value)
}

function assertObject(value: unknown, opts: DecodeOptions | undefined): DecodeResult<Record<string, unknown>> {
  if (typeof value !== 'object' || !value) {
    return error(`Object expected`, value)
  }
  return success(value as Record<string, unknown>)
}

function checkObjectOptions(
  value: Record<string, unknown>,
  opts: ObjectType['opts'],
): DecodeResult<{ value: Record<string, unknown>; accumulator: Record<string, unknown> }> {
  if (opts?.strict) {
    return success({ value, accumulator: {} })
  }
  return success({ value, accumulator: { ...value } })
}

function decodeObjectProperties(
  value: Record<string, unknown>,
  type: ObjectType,
  accumulator: Record<string, unknown>,
  opts: DecodeOptions | undefined,
): DecodeResult<Record<string, unknown>> {
  for (const [key, subtype] of Object.entries(type.type)) {
    const result = decodeInternal(subtype, value[key], opts)
    const enrichedResult = enrichErrors(result, key)
    if (!enrichedResult.pass) {
      return enrichedResult
    }
    if (enrichedResult.value !== undefined) {
      accumulator[key] = enrichedResult.value
    }
  }
  return success(accumulator)
}

function checkStringOptions(value: string, opts: StringType['opts']): DecodeResult<string> {
  if (opts?.maxLength != null && value.length > opts.maxLength) {
    return error(`String longer than max length (${opts.maxLength})`, value)
  }
  if (opts?.minLength != null && value.length < opts.minLength) {
    return error(`String shorter than min length (${opts.minLength})`, value)
  }
  if (opts?.regex != null && !opts.regex.test(value)) {
    return error(`String regex mismatch (${opts.regex.source})`, value)
  }
  return success(value)
}

function assertArray(value: unknown, opts: DecodeOptions | undefined): DecodeResult<unknown[]> {
  if (Array.isArray(value)) {
    return success(value)
  }
  if (opts?.cast && typeof value === 'object' && value) {
    // { 0: "a", 1: "b" } -> ["a", "b"]
    const keys = Object.keys(value)
    if (keys.some((v) => Number.isNaN(Number(v)))) {
      return error(`Array expected`, value)
    }
    const array: unknown[] = []
    for (let i = 0; i < keys.length; i++) {
      const index = Number(keys[i])
      if (index !== i) {
        return error(`Array expected`, value)
      }
      array.push((value as Record<string, unknown>)[keys[i]])
    }
    if (array.length === keys.length) {
      return success(array)
    }
  }
  return error(`Array expected`, value)
}

function checkArrayOptions(value: unknown[], opts: ArrayDecorator['opts']): DecodeResult<unknown[]> {
  if (opts?.maxItems != null && value.length > opts.maxItems) {
    return error(`Array must have maximum ${opts.maxItems} items`, value)
  }
  return success(value)
}

function decodeArrayElements(
  value: unknown[],
  type: ArrayDecorator,
  opts: DecodeOptions | undefined,
): DecodeResult<unknown[]> {
  const values: unknown[] = []
  for (let i = 0; i < value.length; i++) {
    const result = decodeInternal(type.type, value[i], opts)
    const enrichedResult = enrichErrors(result, i.toString())
    if (!enrichedResult.pass) {
      return enrichedResult
    }
    values.push(enrichedResult.value)
  }
  return success(values)
}

function assertNumber(value: unknown, opts: DecodeOptions | undefined): DecodeResult<number> {
  if (typeof value === 'number') {
    return success(value)
  }
  if (opts?.cast) {
    const v = Number(value)
    if (!Number.isNaN(v)) {
      return success(v)
    }
  }
  return error(`Number expected`, value)
}

function checkNumberOptions(value: number, opts: NumberType['opts']): DecodeResult<number> {
  if (opts?.minimum != null && value < opts.minimum) {
    return error(`Number must be greater than or equal to ${opts.minimum}`, value)
  }
  if (opts?.maximum != null && value > opts.maximum) {
    return error(`Number must be less than or equal to ${opts.maximum}`, value)
  }
  if (opts?.exclusiveMinimum != null && value <= opts.exclusiveMinimum) {
    return error(`Number must be greater than ${opts.exclusiveMinimum}`, value)
  }
  if (opts?.exclusiveMaximum != null && value >= opts.exclusiveMaximum) {
    return error(`Number must be less than ${opts.exclusiveMaximum}`, value)
  }
  if (opts?.multipleOf != null && value % opts.multipleOf !== 0) {
    return error(`Number must be mutiple of ${opts.multipleOf}`, value)
  }
  return success(value)
}

function assertBoolean(value: unknown, opts: DecodeOptions | undefined): DecodeResult<boolean> {
  if (typeof value === 'boolean') {
    return success(value)
  }
  if (opts?.cast) {
    if (typeof value === 'number') {
      return success(value ? true : false)
    }
    if (typeof value === 'string') {
      return success(value ? true : false)
    }
  }
  return error(`Boolean expected`, value)
}
