import { types, result, validator, path } from './index'
import { assertNever } from './utils'

export type Options = {
  errorReportingStrategy: 'allErrors' | 'stopAtFirstError'
}

export const defaultOptions: Options = {
  errorReportingStrategy: 'stopAtFirstError',
}

/**
 * The result of the validation process, it could either be `true` in case of success or
 * a list of `validator.Error` in case of failure.
 */
export type Result = result.Result<true, Error[]>

/**
 * TODO: add doc
 */
export type Error = {
  assertion: string
  got: unknown
  path: path.Path
}

/**
 * Utility function to prepend a prefix to the path of a `validator.Error`.
 */
function prependFieldToPath(fieldName: string): (error: Error) => Error {
  return (error: Error) => ({ ...error, path: error.path.prependField(fieldName) })
}

/**
 * Utility function to prepend an index to the path of a `validator.Error`.
 */
function prependIndexToPath(index: number): (error: Error) => Error {
  return (error: Error) => ({ ...error, path: error.path.prependIndex(index) })
}

/**
 * Utility function to prepend a variant to the path of a `validator.Error`.
 */
function prependVariantToPath(variantName: string): (error: Error) => Error {
  return (error: Error) => ({ ...error, path: error.path.prependVariant(variantName) })
}

/**
 * The value returned by a succeeding validation process.
 */
export const succeed: () => Result = () => result.ok(true)

/**
 * @param errors the errors that made the validation process fail
 * @returns a `validator.Result` that fails with the given array of errors
 */
export const failWithErrors = (errors: Error[]): Result => result.fail(errors)

/**
 * @param assertion the assertion that failed
 * @param got the actual value that couldn't be validated
 * @returns a `validator.Result` that fails with a single error with an empty path and the provided
 *          `assertion` and `got` values
 */
export const fail = (assertion: string, got: unknown): Result =>
  failWithErrors([{ assertion, got, path: path.empty() }])

/**
 * @param type the {@link Type type} to define the validation logic
 * @param value the value of the type to validate
 * @param options the {@link Options `Options`} used to perform the validation
 * @returns a successful result with the validated value if it respects the type validation logic
 */
export function validate<T extends types.Type>(
  type: T,
  value: types.Infer<T>,
  options?: Partial<validator.Options>,
): validator.Result {
  const actualOptions = { ...defaultOptions, ...options }
  return internalValidate(type, value, actualOptions)
}

function internalValidate<T extends types.Type>(
  type: T,
  value: types.Infer<T>,
  options: validator.Options,
): validator.Result {
  const concreteType = types.concretise(type)

  if (concreteType.kind === 'boolean') {
    return validator.succeed()
  } else if (concreteType.kind === 'enum') {
    return validator.succeed()
  } else if (concreteType.kind === 'literal') {
    return validator.succeed()
  } else if (concreteType.kind === 'number') {
    return validateNumber(concreteType, value as any)
  } else if (concreteType.kind === 'string') {
    return validateString(concreteType, value as any)
  } else if (concreteType.kind === 'optional') {
    return validateOptional(concreteType, value as any, options)
  } else if (concreteType.kind === 'nullable') {
    return validateNullable(concreteType, value as any, options)
  } else if (concreteType.kind === 'object') {
    return validateObject(concreteType, value as any, options)
  } else if (concreteType.kind === 'union') {
    return validateUnion(concreteType, value as any, options)
  } else if (concreteType.kind === 'array') {
    return validateArray(concreteType, value as any, options)
  } else if (concreteType.kind === 'reference') {
    return validateReference(concreteType, value as any, options)
  } else if (concreteType.kind === 'custom') {
    return concreteType.validate(value, options, concreteType.options)
  } else {
    assertNever(concreteType, 'Totality check failed when validating a value, this should have never happened')
  }
}

function validateNumber(type: types.NumberType, value: number): validator.Result {
  if (type.options === undefined) {
    return validator.succeed()
  }
  const { maximum, minimum, exclusiveMaximum, exclusiveMinimum, isInteger } = type.options
  if (maximum && !(value <= maximum)) {
    return validator.fail(`number must be less than or equal to ${maximum}`, value)
  } else if (exclusiveMaximum && !(value < exclusiveMaximum)) {
    return validator.fail(`number must be less than to ${exclusiveMaximum}`, value)
  } else if (minimum && !(value >= minimum)) {
    return validator.fail(`number must be greater than or equal to ${minimum}`, value)
  } else if (exclusiveMinimum && !(value > exclusiveMinimum)) {
    return validator.fail(`number must be greater than ${exclusiveMinimum}`, value)
  } else if (isInteger && !Number.isInteger(value)) {
    return validator.fail(`number must be an integer`, value)
  } else {
    return validator.succeed()
  }
}

function validateString(type: types.StringType, value: string): validator.Result {
  if (type.options === undefined) {
    return validator.succeed()
  }
  const { regex, maxLength, minLength } = type.options
  if (maxLength && value.length > maxLength) {
    return validator.fail(`string longer than max length (${maxLength})`, value)
  }
  if (minLength && value.length < minLength) {
    return validator.fail(`string shorter than min length (${minLength})`, value)
  }
  if (regex && !regex.test(value)) {
    return validator.fail(`string regex mismatch (${regex.source})`, value)
  }
  return validator.succeed()
}

function validateOptional<T extends types.Type>(
  type: types.OptionalType<T>,
  value: types.Infer<types.OptionalType<T>>,
  options: validator.Options,
): validator.Result {
  return value === undefined ? validator.succeed() : internalValidate(type.wrappedType, value, options)
}

function validateNullable<T extends types.Type>(
  type: types.NullableType<T>,
  value: types.Infer<types.NullableType<T>>,
  options: validator.Options,
): validator.Result {
  return value === null ? validator.succeed() : internalValidate(type.wrappedType, value, options)
}

function validateObject<Ts extends types.Types>(
  type: types.ObjectType<any, Ts>,
  value: types.Infer<types.ObjectType<any, Ts>>,
  options: validator.Options,
): validator.Result {
  const validationErrors: validator.Error[] = []
  for (const [fieldName, fieldValue] of Object.entries(value)) {
    const validationResult = internalValidate(type.types[fieldName], fieldValue as never, options)
    if (!validationResult.isOk) {
      validationErrors.push(...validationResult.error.map(prependFieldToPath(fieldName)))
      if (options.errorReportingStrategy === 'stopAtFirstError') {
        break
      }
    }
  }
  return validationErrors.length > 0 ? validator.failWithErrors(validationErrors) : validator.succeed()
  /* TODO see what to do with object strictness
  if (strict) {
      for (const [key, subvalue] of Object.entries(value)) {
        if (!(key in t.type) && subvalue !== undefined) {
          errs.push(richError(`Value not expected`, subvalue, key))
          if (errorLevel === 'minimum') {
            break
          }
        }
      }
    }
   */
}

function validateArray<T extends types.Type>(
  type: types.ArrayType<any, T>,
  value: types.Infer<types.ArrayType<any, T>>,
  options: validator.Options,
): validator.Result {
  if (type.options === undefined) {
    return validator.succeed()
  }
  const { maxItems, minItems } = type.options
  if (maxItems && value.length > maxItems) {
    return validator.fail(`array must have at most ${maxItems} items`, value)
  }
  if (minItems && value.length < minItems) {
    return validator.fail(`array must have at least ${minItems} items`, value)
  }
  return validateArrayElements(type, value, options)
}

function validateArrayElements<T extends types.Type>(
  type: types.ArrayType<any, T>,
  value: types.Infer<types.ArrayType<any, T>>,
  options: validator.Options,
): validator.Result {
  const validationErrors: validator.Error[] = []
  for (let i = 0; i < value.length; i++) {
    const validationResult = internalValidate(type.wrappedType, value[i], options)
    if (!validationResult.isOk) {
      validationErrors.push(...validationResult.error.map(prependIndexToPath(i)))
      if (options.errorReportingStrategy === 'stopAtFirstError') {
        break
      }
    }
  }
  return validationErrors.length > 0 ? validator.failWithErrors(validationErrors) : validator.succeed()
}

function validateReference<T extends types.Type>(
  type: types.ReferenceType<T>,
  value: types.Infer<types.ReferenceType<T>>,
  options: validator.Options,
): validator.Result {
  return internalValidate(type.wrappedType, value, options)
}

function validateUnion<Ts extends types.Types>(
  type: types.UnionType<Ts>,
  value: types.Infer<types.UnionType<Ts>>,
  options: validator.Options,
): validator.Result {
  for (const [variantName, variantType] of Object.entries(type.variants)) {
    const variantCheck = type.variantsChecks?.[variantName]
    // If the variant can be decoded as one of the variants
    const valueIsVariant = variantCheck && variantCheck(value)
    if (valueIsVariant) {
      const validationErrors: Error[] = []
      const validationResult = internalValidate(variantType, value as never, options)
      if (!validationResult.isOk) {
        validationErrors.push(...validationResult.error.map(prependVariantToPath(variantName)))
      }
      return validationErrors.length > 0 ? validator.failWithErrors(validationErrors) : validator.succeed()
    }
  }
  return validator.fail('value does not pass any of the variant checks', value)
}
