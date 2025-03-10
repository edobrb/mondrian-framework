import { decoding, model, validation } from '../..'
import { BaseType } from './base'
import { JSONType } from '@mondrian-framework/utils'
import gen from 'fast-check'

/**
 * @param variants a non empty array of string values used to define the new `EnumType`'s variants
 * @param options the {@link model.EnumTypeOptions} used to define the new `EnumType`
 * @returns an {@link model.EnumType} with the given variants and options
 * @example Imagine you have to deal with two kind of users - admins and normal users - their type can be modelled with
 *          an enum like this:
 *
 *          ```ts
 *          type UserKind = model.Infer<typeof userKind>
 *          const userKind = model.enumeration(["ADMIN", "NORMAL"], {
 *            name: "user_kind",
 *            description: "the kind of a user",
 *          })
 *
 *          const exampleUserKind : UserKind = "ADMIN"
 *          ```
 */
export function enumeration<const Vs extends readonly [string, ...string[]]>(
  variants: Vs,
  options?: model.EnumTypeOptions,
): model.EnumType<Vs> {
  return new EnumTypeImpl(variants, options)
}

class EnumTypeImpl<Vs extends readonly [string, ...string[]]>
  extends BaseType<model.EnumType<Vs>>
  implements model.EnumType<Vs>
{
  readonly kind = model.Kind.Enum
  readonly variants: Vs
  private variantSet: Set<string>

  protected fromOptions = (options: model.EnumTypeOptions) => enumeration(this.variants, options)
  protected getThis = () => this

  constructor(variants: Vs, options?: model.EnumTypeOptions) {
    super(options)
    this.variants = variants
    this.variantSet = new Set(variants)
  }

  protected encodeWithoutValidationInternal(value: model.Infer<model.EnumType<Vs>>): JSONType {
    return value
  }

  protected validateInternal(_value: model.Infer<model.EnumType<Vs>>): validation.Result {
    return validation.succeed()
  }

  protected decodeWithoutValidationInternal(value: unknown): decoding.Result<Vs[number]> {
    return typeof value === 'string' && this.variantSet.has(value)
      ? decoding.succeed(value)
      : decoding.fail(`enum (${this.variants.map((v: any) => `"${v}"`).join(' | ')})`, value)
  }

  arbitrary(): gen.Arbitrary<Vs[number]> {
    return gen.constantFrom(...this.variants)
  }
}
