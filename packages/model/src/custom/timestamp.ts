import { Result, error, success } from '../result'
import { CustomType, OptionsOf, custom } from '../type-system'
import { fc as gen } from '@fast-check/vitest'
import { JSONType } from '@mondrian-framework/utils'
import { DecodingOptions } from 'src/decoder'
import { ValidationOptions } from 'src/validate'

/**
 * The type of a timestamp, defined as a custom type.
 */
export type TimestampType = CustomType<'timestamp', TimestampOptions, Date>

/**
 * Additional options for the Timestamp `CustomType`
 */
export type TimestampOptions = { minimum?: Date; maximum?: Date }

/**
 * @param options the options used to create the new timestamp custom type
 * @returns a {@link CustomType `CustomType`} representing a timestamp
 */
export function timestamp(options?: OptionsOf<TimestampType>): TimestampType {
  return custom('timestamp', encodeTimestamp, decodeTimestamp, validateTimestamp, timestampArbitrary(options), options)
}

function encodeTimestamp(timestamp: Date): JSONType {
  return timestamp.getTime()
}

function decodeTimestamp(
  value: unknown,
  _decodingOptions: DecodingOptions,
  _options?: OptionsOf<TimestampType>,
): Result<Date> {
  return typeof value === 'number' && -864000000000000 < value && value < 864000000000000
    ? success(new Date(value))
    : error(`Timestamp must be between -864000000000000 and 864000000000000`, value)
}

function validateTimestamp(
  input: Date,
  _validationOptions: ValidationOptions,
  options?: OptionsOf<TimestampType>,
): Result<true> {
  if (options === undefined) {
    return success(true)
  }
  const { minimum, maximum } = options
  if (maximum && input.getTime() > maximum.getTime()) {
    return error(`Timestamp must be maximum ${maximum.toISOString()}`, input)
  }
  if (minimum && input.getTime() < minimum.getTime()) {
    return error(`Timestamp must be minimum ${minimum.toISOString()}`, input)
  }
  return success(true)
}

function timestampArbitrary(options?: OptionsOf<TimestampType>): gen.Arbitrary<Date> {
  return gen
    .integer({ min: options?.minimum?.getTime() ?? 0, max: options?.maximum?.getTime() ?? 864000000000000 })
    .map((t) => new Date(t))
}
