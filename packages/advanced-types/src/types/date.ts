import { m, validate } from '@mondrian-framework/model'
import { Result, error, success } from '@mondrian-framework/model/src/result'
import { ValidationOptions } from '@mondrian-framework/model/src/validate'

const DATE_REGEX = /^(\d{4}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01]))$/

export type DateTypeAdditionalOptions = {
  minimum?: Date
  maximum?: Date
}

export type DateType = m.CustomType<'date', DateTypeAdditionalOptions, Date>

export function date(options?: m.OptionsOf<DateType>): DateType {
  return m.custom('date', (value) => value.toISOString().split('T')[0], decodeDate, validateDate, options)
}

function decodeDate(value: unknown): Result<Date> {
  console.log(value)
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
    return error('Invalid date format (expected: yyyy-mm-dd)', value)
  }
  const date = new Date(Date.parse(value))
  console.log('DATE:', date)
  console.log('DATE:', date.valueOf())
  return isNaN(date.valueOf()) ? error('Invalid date', value) : success(date)
}

function validateDate(
  value: Date,
  validationOptions: ValidationOptions,
  options?: m.OptionsOf<DateType>,
): Result<true> {
  return validate(m.dateTime(options), value, validationOptions)
}
