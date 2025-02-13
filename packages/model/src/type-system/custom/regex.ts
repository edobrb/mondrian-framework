import { decoding, model, validation } from '../..'
import gen from 'fast-check'

export function fromRegexes<Name extends string, Options extends Record<string, any>>(
  typeName: Name,
  errorMessage: string,
  options: model.OptionsOf<model.CustomType<Name, Options, string>> | undefined,
  arbitrary: gen.Arbitrary<string> | undefined,
  regex: RegExp,
  ...regexes: RegExp[]
): model.CustomType<Name, Options, string> {
  return model.custom({
    typeName,
    encoder: (value) => value,
    decoder,
    validator: (input) => validate(input, errorMessage, [regex, ...regexes]),
    arbitrary: () => arbitrary ?? gen.stringMatching(regex),
    options,
  })
}

function decoder<Name extends string, Options extends Record<string, any>>(
  value: unknown,
  _decodingOptions: Required<decoding.Options>,
  _options?: model.OptionsOf<model.CustomType<Name, Options, string>>,
): decoding.Result<string> {
  return typeof value === 'string' ? decoding.succeed(value) : decoding.fail('Expected a string value', value)
}

function validate(input: string, errorMessage: string, regexes: RegExp[]): validation.Result {
  return regexes.some((regex) => regex.test(input)) ? validation.succeed() : validation.fail(errorMessage, input)
}
