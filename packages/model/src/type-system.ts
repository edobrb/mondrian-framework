import { decoding, validation, types, result } from './index'
import { filterMapObject, mapObject } from './utils'
import { JSONType } from '@mondrian-framework/utils'

/**
 * The possible kinds of types modelled by the Mondrian Framework
 *
 * @see {@link Type}
 */
export enum Kind {
  Number,
  String,
  Boolean,
  Enum,
  Literal,
  Union,
  Object,
  Array,
  Optional,
  Nullable,
  Reference,
  Custom,
}

/**
 * A type that can be defined with the Mondrian framework. Types are used to provide a formal description
 * of your data. In addition, the Mondrian framework can take advantage of these definitions to
 * automatically generate encoders, decoders, and much more
 *
 * @see To learn more about the Mondrian model, read the
 * [online documentation](https://twinlogix.github.io/mondrian-framework/docs/docs/model)
 */
export type Type =
  | NumberType
  | StringType
  | BooleanType
  | EnumType<any>
  | LiteralType<any>
  | UnionType<any>
  | ObjectType<any, any>
  | ArrayType<any, any>
  | OptionalType<any>
  | NullableType<any>
  | ReferenceType<any>
  | CustomType<any, {}, any>
  | (() => Type)

/**
 * Utility type to turn any type into a possibly lazy version of itself
 *
 * @example ```ts
 *          function do_something(arg: Lazy<number>) { ... }
 *          do_something(1)         // Since the argument is lazy it can either be a number value
 *          do_something(() => 1)   // or a function that returns a number value
 *          ```
 */
export type Lazy<T> = T | (() => Lazy<T>)

/**
 * A record of {@link Type `Type`s}
 */
export type Types = Record<string, Type>

/**
 * The same as type but doesn't include the lazy type definition: `() => Type`.
 * This type can be useful when you want to make sure that you're working with an actual type
 * and not a lazy definition
 *
 * @example ```ts
 *          const lazyModel = () => types.number().array()
 *          type ModelType = Concrete<typeof lazyModel>
 *          // ModelType = ArrayType<"immutable", NumberType>
 *          ```
 * @see {@link concretise} to turn a possibly-lazy type into a concrete type
 */
export type Concrete<T extends Type> = [T] extends [() => infer T1 extends Type] ? Concrete<T1> : Exclude<T, () => any>

/**
 * A type that turns a Mondrian {@link Type `Type`} into the equivalent TypeScript's type
 *
 * @example ```ts
 *          const model = types.string()
 *          type Type = types.Infer<typeof model>
 *          // Type = string
 *          ```
 * @example ```ts
 *          const model = types.number().nullable()
 *          type Type = types.Infer<typeof model>
 *          // Type = number | null
 *          ```
 * @example ```ts
 *          const model = types.object({
 *            field1: types.number(),
 *            field2: types.string(),
 *          })
 *          type Type = types.Infer<typeof model>
 *          // Type = { field1: number, field2: string }
 *          ```
 */
// prettier-ignore
export type Infer<T extends Type>
  = [T] extends [NumberType] ? number
  : [T] extends [StringType] ? string
  : [T] extends [BooleanType] ? boolean
  : [T] extends [LiteralType<infer L>] ? InferLiteral<L>
  : [T] extends [CustomType<any, any, infer InferredAs>] ? InferredAs
  : [T] extends [EnumType<infer Vs>] ? InferEnum<Vs>
  : [T] extends [OptionalType<infer T1>] ? InferOptional<T1>
  : [T] extends [NullableType<infer T1>] ? InferNullable<T1>
  : [T] extends [ReferenceType<infer T1>] ? InferReference<T1>
  : [T] extends [ArrayType<infer M, infer T1>] ? InferArray<M, T1>
  : [T] extends [ObjectType<infer M, infer Ts>] ? InferObject<M, Ts>
  : [T] extends [UnionType<infer Ts>] ? InferUnion<Ts>
  : [T] extends [(() => infer T1 extends Type)] ? Infer<T1>
  : never

type InferObject<M, Ts extends Types> = M extends Mutability.Mutable ? InferMutableObject<Ts> : InferImmutableObject<Ts>
// prettier-ignore
type InferImmutableObject<Ts extends Types> = { readonly [Key in NonOptionalKeys<Ts>]: Infer<Ts[Key]> } & { readonly [Key in OptionalKeys<Ts>]?: Infer<Ts[Key]> }
// prettier-ignore
type InferMutableObject<Ts extends Types> = { [Key in NonOptionalKeys<Ts>]: Infer<Ts[Key]> } & { [Key in OptionalKeys<Ts>]?: Infer<Ts[Key]> }
type InferUnion<Ts extends Types> = { [Key in keyof Ts]: { readonly [P in Key]: Infer<Ts[Key]> } }[keyof Ts]
type InferEnum<Vs extends readonly [string, ...string[]]> = Vs[number]
type InferLiteral<L> = L
type InferArray<M, T extends Type> = M extends Mutability.Mutable ? InferMutableArray<T> : InferImmutableArray<T>
type InferMutableArray<T extends Type> = Infer<T>[]
type InferImmutableArray<T extends Type> = readonly Infer<T>[]
type InferOptional<T extends Type> = undefined | Infer<T>
type InferNullable<T extends Type> = null | Infer<T>
type InferReference<T extends Type> = Infer<T>

/**
 * Given an array of types, returns the union of the fields whose type is optional
 *
 * @example ```ts
 *          const model = types.object({
 *            foo: types.string(),
 *            bar: types.number().optional(),
 *            baz: types.boolean().array().optional(),
 *          })
 *          OptionalKeys<typeof model> // "bar" | "baz"
 *          ```
 */
type OptionalKeys<T extends Types> = { [K in keyof T]: IsOptional<T[K]> extends true ? K : never }[keyof T]

/**
 * Given an array of types, returns the union of the fields whose type is not optional
 *
 * @example ```ts
 *          const model = types.object({
 *            foo: types.string(),
 *            bar: types.number().optional(),
 *            baz: types.boolean().array(),
 *          })
 *          OptionalKeys<typeof model> // "foo" | "baz"
 *          ```
 */
type NonOptionalKeys<T extends Types> = { [K in keyof T]: IsOptional<T[K]> extends true ? never : K }[keyof T]

/**
 * Returns the literal type `true` for any {@link Type} that is optional. That is, if the type has a top-level
 * {@link OptionalType optional wrapper}
 *
 * @example ```ts
 *          const model = types.number().optional().reference()
 *          IsOptional<typeof model> // true
 *          ```
 *          The top-level decorators are `OptionalType` and `ReferenceType` so the type is optional
 * @example ```ts
 *          const model = types.number().optional()
 *          IsOptional<typeof model> // true
 *          ```
 *          The top-level decorator is `OptionalType` so the type is optional
 * @example ```ts
 *          const model = types.number().optional().array()
 *          IsOptional<typeof model> // false
 *          ```
 *          The top-level decorator is `ArrayType` so the type is not optional
 */
//prettier-ignore
type IsOptional<T extends Type> 
  = [T] extends [OptionalType<infer _T1>] ? true
  : [T] extends [NullableType<infer T1>] ? IsOptional<T1>
  : [T] extends [ReferenceType<infer T1>] ? IsOptional<T1>
  : [T] extends [() => infer T1 extends Type] ? IsOptional<T1>
  : false

/**
 * Returns the literal type `true` for any {@link Type} that is a reference.
 * That is, if the type has a top-level {@link ReferenceType reference wrapper}
 *
 * @example ```ts
 *          const model = types.number().optional().reference()
 *          IsOptional<typeof model> // true
 *          ```
 *          The top-level decorators are `OptionalType` and `ReferenceType` so the type is a reference
 * @example ```ts
 *          const model = types.number().reference()
 *          IsOptional<typeof model> // true
 *          ```
 *          The top-level decorator is `ReferenceType` so the type is a reference
 * @example ```ts
 *          const model = types.number().reference().array()
 *          IsOptional<typeof model> // false
 *          ```
 *          The top-level decorator is `ArrayType` so the type is not a reference
 */
//prettier-ignore
type IsReference<T extends Type> 
  = [T] extends [ReferenceType<infer _T1>] ? true
  : [T] extends [NullableType<infer T1>] ? IsReference<T1>
  : [T] extends [ReferenceType<infer T1>] ? IsReference<T1>
  : [T] extends [() => infer T1 extends Type] ? IsReference<T1>
  : false

/**
 * Given a {@link Type}, returns the type of the options it can accept when it is defined
 *
 * @example ```ts
 *          type Options = OptionsOf<NumberType>
 *          // Options = NumberTypeOptions
 *          ```
 */
// prettier-ignore
export type OptionsOf<T extends Type>
  = [T] extends [NumberType] ? NonNullable<NumberType['options']>
  : [T] extends [StringType] ? NonNullable<StringType['options']>
  : [T] extends [BooleanType] ? NonNullable<BooleanType['options']>
  : [T] extends [EnumType<infer T1>] ? NonNullable<EnumType<T1>['options']>
  : [T] extends [LiteralType<infer L>] ? NonNullable<LiteralType<L>['options']>
  : [T] extends [UnionType<infer Ts>] ? NonNullable<UnionType<Ts>['options']>
  : [T] extends [ObjectType<infer Ts, infer Mutable>] ? NonNullable<ObjectType<Ts, Mutable>['options']>
  : [T] extends [ArrayType<infer M, infer T1>] ? NonNullable<ArrayType<M, T1>['options']>
  : [T] extends [OptionalType<infer T1>] ? NonNullable<OptionalType<T1>['options']>
  : [T] extends [NullableType<infer T1>] ? NonNullable<NullableType<T1>['options']>
  : [T] extends [ReferenceType<infer T1>] ? NonNullable<ReferenceType<T1>['options']>
  : [T] extends [CustomType<infer N, infer Os, infer T>] ? NonNullable<CustomType<N, Os, T>['options']>
  : [T] extends [(() => infer T1 extends Type)] ? OptionsOf<T1>
  : never

/**
 * The possible mutability of object and array types
 */
export enum Mutability {
  Mutable,
  Immutable,
}

/**
 * @param type the possibly lazy {@link Type type} to turn into a concrete type
 * @returns a new {@link ConcreteType type} that is guaranteed to not be lazily defined
 * @example if you just work with your own types you will rarely need this function. However,
 *          it can be handy when working with generic types:
 *          ```ts
 *          function do_something<T extends types.Type>(t: T) {
 *            const concrete = types.concretise(t)
 *            // now you can call methods like `validate` on `concrete`
 *          }
 *          ```
 */
export function concretise<T extends Type>(type: T): Concrete<T> {
  //TODO: caching by function address?
  let concreteType: any = type
  while (typeof concreteType === 'function') {
    concreteType = concreteType()
  }
  return concreteType
}

/**
 * The basic options that are common to all the types of the Mondrian framework.
 * Every type can be defined by providing its smart constructor a set of options; for example
 * they can be used to perform extra validation, influence the decoding process or customise
 * API generation
 */
export type BaseOptions = {
  readonly name?: string
  readonly description?: string
}

/**
 * The model of a `string` in the Mondrian framework
 *
 * @see {@link types.string} to build a `StringType`
 */
export type StringType = {
  readonly kind: Kind.String
  readonly options?: StringTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.string().optional()
   *          types.Infer<typeof model> // string | undefined
   *          ```
   */
  optional(): OptionalType<StringType>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.string().nullable()
   *          types.Infer<typeof model> // string | null
   *          ```
   */
  nullable(): NullableType<StringType>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.string().array()
   *          types.Infer<typeof model> // string[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, StringType>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.string.reference()
   *          types.Infer<typeof model> // string
   *          ```
   */
  reference(): ReferenceType<StringType>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.string()
   *          model.decode("foo") // succeeds with value: "foo"
   *          model.decode(12) // fails: expected a string, got a number
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<Infer<StringType>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<Infer<StringType>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: Infer<StringType>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.string()
   *          model.encode("foo") // succeeds with value: "foo"
   *          ```
   */
  encode(value: Infer<StringType>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: Infer<StringType>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: StringTypeOptions): StringType
  updateOptions(options: StringTypeOptions): StringType
  setName(name: string): StringType
}

/**
 * The options that can be used to define a `StringType`
 */
export type StringTypeOptions = BaseOptions & {
  readonly regex?: RegExp
  readonly maxLength?: number
  readonly minLength?: number
}

/**
 * The model of a `number` in the Mondrian framework
 *
 * @see {@link types.number} to build a `NumberType`
 */
export type NumberType = {
  readonly kind: Kind.Number
  readonly options?: NumberTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.number().optional()
   *          types.Infer<typeof model> // number | undefined
   *          ```
   */
  optional(): OptionalType<NumberType>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.number().nullable()
   *          types.Infer<typeof model> // number | null
   *          ```
   */
  nullable(): NullableType<NumberType>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.number().array()
   *          types.Infer<typeof model> // number[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, NumberType>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.number().reference()
   *          types.Infer<typeof model> // number
   *          ```
   */
  reference(): ReferenceType<NumberType>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.number()
   *          model.decode(12) // succeeds with value: 12
   *          model.decode("foo") // fails: expected a number, got a string
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<Infer<NumberType>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<Infer<NumberType>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: Infer<NumberType>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.number()
   *          model.encode(11) // succeeds with value: 11
   *          ```
   */
  encode(value: Infer<NumberType>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: Infer<NumberType>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: NumberTypeOptions): NumberType
  updateOptions(options: NumberTypeOptions): NumberType
  setName(name: string): NumberType
}

/**
 * The options that can be used to define a {@link NumberType `NumberType`}.
 */
export type NumberTypeOptions = BaseOptions & {
  readonly maximum?: number
  readonly exclusiveMaximum?: number
  readonly minimum?: number
  readonly exclusiveMinimum?: number
  readonly isInteger?: boolean
}

/**
 * The model of a `boolean` in the Mondrian framework.
 */
export type BooleanType = {
  readonly kind: Kind.Boolean
  readonly options?: BooleanTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.boolean().optional()
   *          types.Infer<typeof model> // boolean | undefined
   *          ```
   */
  optional(): OptionalType<BooleanType>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.boolean().nullable()
   *          types.Infer<typeof model> // boolean | null
   *          ```
   */
  nullable(): NullableType<BooleanType>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.boolean().array()
   *          types.Infer<typeof model> // boolean[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, BooleanType>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.boolean().reference()
   *          types.Infer<typeof model> // boolean
   *          ```
   */
  reference(): ReferenceType<BooleanType>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.boolean()
   *          model.decode(true) // succeeds with value: true
   *          model.decode("foo") // fails: expected boolean, got a string
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<Infer<BooleanType>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<Infer<BooleanType>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: Infer<BooleanType>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.boolean()
   *          model.encode(true) // succeeds with value: true
   *          ```
   */
  encode(value: Infer<BooleanType>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: Infer<BooleanType>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: BooleanTypeOptions): BooleanType
  updateOptions(options: BooleanTypeOptions): BooleanType
  setName(name: string): BooleanType
}

/**
 * The options that can be used to define a {@link BooleanType `BooleanType`}.
 */
export type BooleanTypeOptions = BaseOptions

/**
 * The model of an enumeration in the Mondrian framework.
 */
export type EnumType<Vs extends readonly [string, ...string[]]> = {
  readonly kind: Kind.Enum
  readonly variants: Vs
  readonly options?: EnumTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"]).optional()
   *          types.Infer<typeof model> // "foo" | "bar" | undefined
   *          ```
   */
  optional(): OptionalType<EnumType<Vs>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"]).nullable()
   *          types.Infer<typeof model> // "foo" | "bar" | null
   *          ```
   */
  nullable(): NullableType<EnumType<Vs>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"]).array()
   *          types.Infer<typeof model> // ("foo" | "bar")[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, EnumType<Vs>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"]).reference()
   *          types.Infer<typeof model> // "foo" | "bar"
   *          ```
   */
  reference(): ReferenceType<EnumType<Vs>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"])
   *          model.decode("foo") // succeeds with value: "foo"
   *          model.decode("bar") // succeeds with value: "bar"
   *          model.decode("baz") // fails: expected "foo" or "bar", got "baz"
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferEnum<Vs>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferEnum<Vs>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferEnum<Vs>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.enumeration(["foo", "bar"])
   *          model.encode("foo") // succeeds with value: "foo"
   *          ```
   */
  encode(value: InferEnum<Vs>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferEnum<Vs>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: EnumTypeOptions): EnumType<Vs>
  updateOptions(options: EnumTypeOptions): EnumType<Vs>
  setName(name: string): EnumType<Vs>
}

/**
 * The options that can be used to define an {@link EnumType `EnumType`}.
 */
export type EnumTypeOptions = BaseOptions

/**
 * The model of a literal type in the Mondrian framework.
 */
export type LiteralType<L extends number | string | boolean | null> = {
  readonly kind: Kind.Literal
  readonly literalValue: L
  readonly options?: LiteralTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.literal(1).optional()
   *          types.Infer<typeof model> // 1 | undefined
   *          ```
   */
  optional(): OptionalType<LiteralType<L>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.literal(1).nullable()
   *          types.Infer<typeof model> // 1 | null
   *          ```
   */
  nullable(): NullableType<LiteralType<L>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.literal(1).array()
   *          types.Infer<typeof model> // (1)[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, LiteralType<L>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.literal(1).reference()
   *          types.Infer<typeof model> // 1
   *          ```
   */
  reference(): ReferenceType<LiteralType<L>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.literal(1)
   *          model.decode(1) // succeeds with value: 1
   *          model.decode(2) // fails: expected literal 1, got 2
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferLiteral<L>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferLiteral<L>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferLiteral<L>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.literal(1)
   *          model.encode(1) // succeeds with value: 1
   *          ```
   */
  encode(value: InferLiteral<L>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferLiteral<L>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: LiteralTypeOptions): LiteralType<L>
  updateOptions(options: LiteralTypeOptions): LiteralType<L>
  setName(name: string): LiteralType<L>
}

/**
 * The options that can be used to define a {@link LiteralType `LiteralType`}.
 */
export type LiteralTypeOptions = BaseOptions

/**
 * The model of a tagged union of types in the Mondrian framework.
 * TODO: add examples (e.g. result/optional/list)
 */
export type UnionType<Ts extends Types> = {
  readonly kind: Kind.Union
  readonly variants: Ts
  readonly options?: UnionTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.union({ v1: types.number(), v2: types.string() }).optional()
   *          types.Infer<typeof model> // { v1: number } | { v2: string } | undefined
   *          ```
   */
  optional(): OptionalType<UnionType<Ts>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.union({ v1: types.number() }, { v2: types.string() }).nullable()
   *          types.Infer<typeof model> // { v1: number } | { v2: string } | null
   *          ```
   */
  nullable(): NullableType<UnionType<Ts>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.union({ v1: types.number() }, { v2: types.string() }).array()
   *          types.Infer<typeof model> // ({ v1: number } | { v2: string })[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, UnionType<Ts>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.union({ v1: types.number() }, { v2: types.string() }).reference()
   *          types.Infer<typeof model> // { v1: number } | { v2: string }
   *          ```
   */
  reference(): ReferenceType<UnionType<Ts>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.union({ v1: types.number() }, { v2: types.string() })
   *          model.decode({ v1: 1 }) // succeeds with value: { v1: 1 }
   *          model.decode({ v2: "foo" }) // succeeds with value: { v2: "foo" }
   *          model.decode({ v3: true }) // fails: expected v1 or v2, got v3
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferUnion<Ts>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferUnion<Ts>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferUnion<Ts>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.union({ v1: types.number() }, { v2: types.string() })
   *          model.encode({ v1: 1 }) // succeeds with value: { v1: 1 }
   *          ```
   */
  encode(value: InferUnion<Ts>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferUnion<Ts>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: UnionTypeOptions): UnionType<Ts>
  updateOptions(options: UnionTypeOptions): UnionType<Ts>
  setName(name: string): UnionType<Ts>
}

/**
 * The options that can be used to define a {@link UnionType `UnionType`}.
 */
export type UnionTypeOptions = BaseOptions

/**
 * The model of an object in the Mondrian framework.
 */
export type ObjectType<M extends Mutability, Ts extends Types> = {
  readonly kind: Kind.Object
  readonly mutability: M
  readonly fields: Ts
  readonly options?: ObjectTypeOptions

  immutable(): ObjectType<Mutability.Immutable, Ts>
  mutable(): ObjectType<Mutability.Mutable, Ts>

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.object({ field: types.number() }).optional()
   *          types.Infer<typeof model> // { readonly field: number } | undefined
   *          ```
   */
  optional(): OptionalType<ObjectType<M, Ts>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.object({ field: types.number() }).nullable()
   *          types.Infer<typeof model> // { readonly field: number } | null
   *          ```
   */
  nullable(): NullableType<ObjectType<M, Ts>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.object({ field: types.number() }).array()
   *          types.Infer<typeof model> // { readonly field: number }[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, ObjectType<M, Ts>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.object({ field: types.number() }).reference()
   *          types.Infer<typeof model> // { field: number }
   *          ```
   */
  reference(): ReferenceType<ObjectType<M, Ts>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.object({ field: types.number() })
   *          model.decode({ field: 1 }) // succeeds with value: { field: 1 }
   *          model.decode({ field: "foo" }) // fails: expected a number in `field`, got a string
   *          model.decode({}) // fails: `field` missing
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferObject<M, Ts>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferObject<M, Ts>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferObject<M, Ts>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.object({ field: types.number() })
   *          model.encode({ field: 1 }) // succeeds with value: { field: 1 }
   *          ```
   */
  encode(value: InferObject<M, Ts>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferObject<M, Ts>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: ObjectTypeOptions): ObjectType<M, Ts>
  updateOptions(options: ObjectTypeOptions): ObjectType<M, Ts>
  setName(name: string): ObjectType<M, Ts>
}

/**
 * The options that can be used to define an {@link ObjectType `ObjectType`}.
 */
export type ObjectTypeOptions = BaseOptions

/**
 * The model of a sequence of elements in the Mondrian framework.
 */
export type ArrayType<M extends Mutability, T extends Type> = {
  readonly kind: Kind.Array
  readonly mutability: M
  readonly wrappedType: T
  readonly options?: ArrayTypeOptions

  immutable(): ArrayType<Mutability.Immutable, T>
  mutable(): ArrayType<Mutability.Mutable, T>

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.number().array().optional()
   *          types.Infer<typeof model> // number[] | undefined
   *          ```
   */
  optional(): OptionalType<ArrayType<M, T>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.number().array().nullable()
   *          types.Infer<typeof model> // number[] | null
   *          ```
   */
  nullable(): NullableType<ArrayType<M, T>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.number().array().array()
   *          types.Infer<typeof model> // number[][]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, ArrayType<M, T>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.number().array().reference()
   *          types.Infer<typeof model> // number[]
   *          ```
   */
  reference(): ReferenceType<ArrayType<M, T>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.number().array()
   *          model.decode([1, 2, 3]) // succeeds with value: [1, 2, 3]
   *          model.decode(["foo"]) // fails: expected number, got string in first element
   *          model.decode(true) // fails: expected array, got boolean
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferArray<M, T>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferArray<M, T>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferArray<M, T>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.number().array()
   *          model.encode([1, 2, 3]) // succeeds with value: [1, 2, 3]
   *          ```
   */
  encode(value: InferArray<M, T>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferArray<M, T>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: ArrayTypeOptions): ArrayType<M, T>
  updateOptions(options: ArrayTypeOptions): ArrayType<M, T>
  setName(name: string): ArrayType<M, T>
}

/**
 * The options that can be used to define an {@link ArrayType `ArrayType`}.
 */
export type ArrayTypeOptions = BaseOptions & {
  readonly maxItems?: number
  readonly minItems?: number
}

/**
 * The model of a possibly-missing element in the Mondrian framework.
 */
export type OptionalType<T extends Type> = {
  readonly kind: Kind.Optional
  readonly wrappedType: T
  readonly options?: OptionalTypeOptions

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.number().optional().nullable()
   *          types.Infer<typeof model> // number | undefined | null
   *          ```
   */
  nullable(): NullableType<OptionalType<T>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.number().optional().array()
   *          types.Infer<typeof model> // (number | undefined)[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, OptionalType<T>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.number().optional().reference()
   *          types.Infer<typeof model> // number | undefined
   *          ```
   */
  reference(): ReferenceType<OptionalType<T>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.number().optional()
   *          model.decode(undefined) // succeeds with value: undefined
   *          model.decode(1) // succeeds with value: 1
   *          model.decode("foo") // fails: expected number or undefined, got string
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferOptional<T>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferOptional<T>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferOptional<T>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.number().optional()
   *          model.encode(11) // succeeds with value: 11
   *          model.encode(undefined) // succeeds with value: null
   *          ```
   */
  encode(value: InferOptional<T>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferOptional<T>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: OptionalTypeOptions): OptionalType<T>
  updateOptions(options: OptionalTypeOptions): OptionalType<T>
  setName(name: string): OptionalType<T>
}

/**
 * The options that can be used to define an {@link OptionalType `OptionalType`}.
 */
export type OptionalTypeOptions = BaseOptions

/**
 * The model of a possibly-null element in the Mondrian framework.
 */
export type NullableType<T extends Type> = {
  readonly kind: Kind.Nullable
  readonly wrappedType: T
  readonly options?: NullableTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.number().nullable().optional()
   *          types.Infer<typeof model> // number | null | undefined
   *          ```
   */
  optional(): OptionalType<NullableType<T>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.number().nullable().array()
   *          types.Infer<typeof model> // (number | null)[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, NullableType<T>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.number().nullable().reference()
   *          types.Infer<typeof model> // number | null
   *          ```
   */
  reference(): ReferenceType<NullableType<T>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.number().nullable()
   *          model.decode(11) // succeeds with value: 11
   *          model.decode(null) // succeeds with value: null
   *          model.decode("foo") // fails: expected number or null, got string
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferNullable<T>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferNullable<T>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferNullable<T>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.number().nullable()
   *          model.encode(11) // succeeds with value: 11
   *          model.encode(null) // succeeds with value: null
   *          ```
   */
  encode(value: InferNullable<T>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferNullable<T>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: NullableTypeOptions): NullableType<T>
  updateOptions(options: NullableTypeOptions): NullableType<T>
  setName(name: string): NullableType<T>
}

/**
 * The options that can be used to define a {@link NullableType `NullableType`}.
 */
export type NullableTypeOptions = BaseOptions

/**
 * The model for a {@link Type `Type`} that is a reference to another type.
 */
export type ReferenceType<T extends Type> = {
  readonly kind: Kind.Reference
  readonly wrappedType: T
  readonly options?: ReferenceTypeOptions

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.number().reference().optional()
   *          types.Infer<typeof model> // number | undefined
   *          ```
   */
  optional(): OptionalType<ReferenceType<T>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.number().reference().nullable()
   *          types.Infer<typeof model> // number | null
   *          ```
   */
  nullable(): NullableType<ReferenceType<T>>

  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.number().reference().array()
   *          types.Infer<typeof model> // number[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, ReferenceType<T>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   * @example ```ts
   *          const model = types.number().reference()
   *          model.decode(12) // succeeds with value: 12
   *          model.decode("foo") // fails: expected number, got string
   *          ```
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferReference<T>, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferReference<T>>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferReference<T>, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   * @example ```ts
   *          const model = types.number().reference()
   *          model.encode(11) // succeeds with value: 11
   *          ```
   */
  encode(value: InferReference<T>, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferReference<T>): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: ReferenceTypeOptions): ReferenceType<T>
  updateOptions(options: ReferenceTypeOptions): ReferenceType<T>
  setName(name: string): ReferenceType<T>
}

/**
 * The options used to define a {@link ReferenceType `ReferenceType`}.
 */
export type ReferenceTypeOptions = BaseOptions

/**
 * The model for a custom-defined type.
 */
export type CustomType<Name extends string, Options extends Record<string, any>, InferredAs> = {
  kind: Kind.Custom
  typeName: Name
  options?: CustomTypeOptions<Options>

  /**
   * Turns this type into an optional version of itself
   *
   * @example ```ts
   *          const model = types.custom<"my_type", {}, number>(...).optional()
   *          types.Infer<typeof model> // number | undefined
   *          ```
   */
  optional(): OptionalType<CustomType<Name, Options, InferredAs>>

  /**
   * Turns this type into a nullable version of itself
   *
   * @example ```ts
   *          const model = types.custom<"my_type", {}, number>(...).nullable()
   *          types.Infer<typeof model> // number | null
   *          ```
   */
  nullable(): NullableType<CustomType<Name, Options, InferredAs>>
  /**
   * Turns this type into an array of elements of this type
   *
   * @example ```ts
   *          const model = types.custom<"my_type", {}, number>(...).array()
   *          types.Infer<typeof model> // number[]
   *          ```
   */
  array(): ArrayType<Mutability.Immutable, CustomType<Name, Options, InferredAs>>

  /**
   * Turns this type into a reference to elements of this type
   *
   * @example ```ts
   *          const model = types.custom<"my_type", {}, number>(...).reference()
   *          types.Infer<typeof model> // number
   *          ```
   */
  reference(): ReferenceType<CustomType<Name, Options, InferredAs>>

  /**
   * @param value
   * @param decodingOptions
   * @param validationOptions
   */
  decode(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): result.Result<InferredAs, validation.Error[] | decoding.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the decoded
   * type and this may lead to hard-to-debug bugs! You should never use this function unless you're
   * 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `decode` instead
   *
   * @param value the value to decode
   * @param decodingOptions the options used during the decoding process
   * @returns a {@link result decoding.Result} which holds the decoded value if the decoding process was successful
   */
  decodeWithoutValidation(value: unknown, decodingOptions?: decoding.Options): decoding.Result<InferredAs>

  /**
   * @param value the value which will be validated
   * @param validationOptions the options to use for the validation process
   * @returns the {@link validation.Result result} of the validation process. It is a successful result
   *          if the provided value pass all the validation checks, a failure otherwise
   */
  validate(value: InferredAs, validationOptions?: validation.Options): validation.Result

  /**
   * @param value the value to encode into a {@link JSONType}
   * @param validationOptions the options used when validating the value to encode
   * @returns an ok {@link result.Result result} if the value to encode is valid (passes the validation
   *          checks) holding the value encoded as a JSONType. If the type is not valid it is not encoded
   *          and a failing result with the {@link validation.Error validation errors} is returned
   */
  encode(value: InferredAs, validationOptions?: validation.Options): result.Result<JSONType, validation.Error[]>

  /**
   * ⚠️ Pay attention when using this function since it does not perform validation on the value before
   * encoding it and this may lead to encoding and passing around values that are not valid! You should
   * never use this function unless you're 100% sure you don't need to perform validation.
   *
   * In normal circumstances you will never need this function and should use `encode` instead
   *
   * @param value the value to encode into a {@link JSONType}
   * @returns the value encoded as a `JSONType`
   */
  encodeWithoutValidation(value: InferredAs): JSONType

  /**
   * @param other the type this will get compared to
   * @returns true if the other type is equal to this one, that is
   *          it is of the same kind and has the same options
   */
  equals(other: Type): boolean

  setOptions(options: CustomTypeOptions<Options>): CustomType<Name, Options, InferredAs>
  updateOptions(options: CustomTypeOptions<Options>): CustomType<Name, Options, InferredAs>
  setName(name: string): CustomType<Name, Options, InferredAs>
}

/**
 * The options used to define a {@link CustomTypeOptions `CustomTypeOptions`}.
 */
export type CustomTypeOptions<AdditionalOptions> = BaseOptions & AdditionalOptions

/**
 * @param one the first `ObjectType` to merge
 * @param other the second `ObjectType` to merge
 * @param options the {@link ObjectTypeOptions options} for the new `ObjectType`.
 *                The options of the merged objects are always ignored, even if this property is set to `undefined`
 * @param mutable result object's mutability. Default is Mutability.Immutable.
 * @returns a new {@link ObjectType `ObjectType`} obtained by merging `one` with `other`.
 *          If both objects define a field with the same name, the type of the resulting field is the one defined by
 *          `other`.
 * @example ```ts
 *          const book = object({ name: string(), publishedIn: integer() })
 *          const description = object({ shortDescription: string(), fullDescription: string() })
 *          const bookWithDescription = merge(book, description)
 *          type BookWithDescription = Infer<typeof bookWithDescription>
 *
 *          const exampleBook: BookWithDescription = {
 *            name: "Example book",
 *            publishedIn: 2023,
 *            shortDescription: "...",
 *            fullDescription: "...",
 *          }
 *          ```
 */
export function merge<Ts1 extends Types, Ts2 extends Types, M extends Mutability = Mutability.Immutable>(
  one: Lazy<ObjectType<any, Ts1>>,
  other: Lazy<ObjectType<any, Ts2>>,
  mutable?: M,
  options?: OptionsOf<ObjectType<M, MergeObjectFields<Ts1, Ts2>>>,
): () => ObjectType<M, MergeObjectFields<Ts1, Ts2>> {
  if (typeof one === 'function' || typeof other === 'function') {
    return () =>
      merge(concretise(one) as ObjectType<any, Ts1>, concretise(other) as ObjectType<any, Ts2>, mutable, options)()
  }
  const mergedFields = { ...one.fields, ...other.fields }
  const constructor = mutable === Mutability.Mutable ? types.mutableObject : types.object
  return () => constructor(mergedFields, options) as unknown as ObjectType<M, MergeObjectFields<Ts1, Ts2>>
}

type MergeObjectFields<Ts1 extends Types, Ts2 extends Types> = {
  [K in keyof Ts1 | keyof Ts2]: K extends keyof Ts2 ? Ts2[K] : K extends keyof Ts1 ? Ts1[K] : never
}

/**
 * @param obj the `ObjectType` to pick
 * @param fields the fields to pick
 * @param options the {@link ObjectTypeOptions options} for the new `ObjectType`.
 *                The options of the result object are always ignored, even if this property is set to `undefined`
 * @param mutable result object's mutability. Default is Mutability.Immutable.
 * @returns a new {@link ObjectType `ObjectType`} obtained by picking only the wanted fields.
 * @example ```ts
 *          const book = object({ name: string(), description: string(), publishedIn: integer() })
 *          const bookWithoutDescription = pick(book, { name: true, publishedIn: true })
 *          type BookWithoutDescription = Infer<typeof bookWithoutDescription>
 *
 *          const exampleBook: BookWithoutDescription = {
 *            name: "Example book",
 *            publishedIn: 2023,
 *          }
 *          ```
 */
export function pick<
  const Ts extends Types,
  const Fields extends { [K in keyof Ts]?: true },
  M extends Mutability = Mutability.Immutable,
>(
  obj: Lazy<ObjectType<any, Ts>>,
  fields: Fields,
  mutable?: M,
  options?: OptionsOf<ObjectType<M, Ts>>,
): () => ObjectType<M, PickObjectFields<Ts, Fields>> {
  if (typeof obj === 'function') {
    return () => pick(concretise(obj) as ObjectType<any, Ts>, fields, mutable, options)()
  }
  const pickedFields = filterMapObject(obj.fields, (k, t) => (k in fields && fields[k] === true ? t : undefined))
  const constructor = mutable === Mutability.Mutable ? types.mutableObject : types.object
  return () => constructor(pickedFields, options) as ObjectType<M, PickObjectFields<Ts, Fields>>
}

type PickObjectFields<Ts extends Types, Fields extends { [K in keyof Ts]?: true }> = {
  [K in keyof Ts & { [FK in keyof Fields]: Fields[FK] extends true ? FK : never }[keyof Fields]]: Ts[K]
}

/**
 * @param obj the `ObjectType` to pick
 * @param fields the fields to omit
 * @param options the {@link ObjectTypeOptions options} for the new `ObjectType`.
 *                The options of the result object are always ignored, even if this property is set to `undefined`
 * @param mutable result object's mutability. Default is Mutability.Immutable.
 * @returns a new {@link ObjectType `ObjectType`} obtained by omitting the specified fields.
 * @example ```ts
 *          const book = object({ name: string(), description: string(), publishedIn: integer() })
 *          const bookWithoutDescription = omit(book, { description: true })
 *          type BookWithoutDescription = Infer<typeof bookWithoutDescription>
 *
 *          const exampleBook: BookWithoutDescription = {
 *            name: "Example book",
 *            publishedIn: 2023,
 *          }
 *          ```
 */
export function omit<
  const Ts extends Types,
  const Fields extends { [K in keyof Ts]?: true },
  M extends Mutability = Mutability.Immutable,
>(
  obj: Lazy<ObjectType<any, Ts>>,
  fields: Fields,
  mutable?: M,
  options?: OptionsOf<ObjectType<M, Ts>>,
): () => ObjectType<M, OmitObjectFields<Ts, Fields>> {
  if (typeof obj === 'function') {
    return () => omit(concretise(obj) as ObjectType<any, Ts>, fields, mutable, options)()
  }
  const pickedFields = filterMapObject(obj.fields, (k, t) => (!(k in fields) || fields[k] !== true ? t : undefined))
  const constructor = mutable === Mutability.Mutable ? types.mutableObject : types.object
  return () => constructor(pickedFields, options) as ObjectType<M, OmitObjectFields<Ts, Fields>>
}

type OmitObjectFields<Ts extends Types, Fields extends { [K in keyof Ts]?: true }> = {
  [K in Exclude<keyof Ts, { [FK in keyof Fields]: Fields[FK] extends true ? FK : never }[keyof Fields]>]: Ts[K]
}

/**
 * @param obj the `ObjectType` to remove all reference fields
 * @param options the {@link ObjectTypeOptions options} for the new `ObjectType`.
 *                The options of the result object are always ignored, even if this property is set to `undefined`
 * @param mutable result object's mutability. Default is Mutability.Immutable.
 * @returns a new {@link ObjectType `ObjectType`} obtained by omitting all the reference fields.
 * @example ```ts
 *          const author = object({ id: string() })
 *          const book = object({ name: string(), publishedIn: integer(), author: Author.reference() })
 *          const bookWithoutAuthor = omitReference(book)
 *          type BookWithoutAuthor = Infer<typeof bookWithoutAuthor>
 *
 *          const exampleBook: BookWithoutAuthor = {
 *            name: "Example book",
 *            publishedIn: 2023,
 *          }
 *          ```
 */
export function omitReferences<const Ts extends Types, M extends Mutability = Mutability.Immutable>(
  obj: Lazy<ObjectType<any, Ts>>,
  mutable?: M,
  options?: OptionsOf<ObjectType<M, Ts>>,
): () => ObjectType<M, OmitReferenceObjectFields<Ts>> {
  if (typeof obj === 'function') {
    return () => omitReferences(concretise(obj) as ObjectType<any, Ts>, mutable, options)()
  }
  const pickedFields = filterMapObject(obj.fields, (_, t) => (hasWrapper(t, Kind.Reference) ? undefined : t))
  const constructor = mutable === Mutability.Mutable ? types.mutableObject : types.object
  return () => constructor(pickedFields, options) as ObjectType<M, OmitReferenceObjectFields<Ts>>
}

type OmitReferenceObjectFields<Ts extends Types> = {
  [K in { [FK in keyof Ts]: IsReference<Ts[FK]> extends true ? never : FK }[keyof Ts]]: Ts[K]
}

/**
 * @param obj the `ObjectType` to transform
 * @param options the {@link ObjectTypeOptions options} for the new `ObjectType`.
 *                The options of the result object are always ignored, even if this property is set to `undefined`
 * @param mutable result object's mutability. Default is Mutability.Immutable.
 * @returns a new {@link ObjectType `ObjectType`} where every fields is optional.
 * @example ```ts
 *          const book = object({ name: string(), description: string(), publishedIn: integer() })
 *          const partialBook = partial(book)
 *          type PartialBook = Infer<typeof partialBook>
 *
 *          const exampleBook: PartialBook = {
 *            name: undefined,
 *          }
 *          ```
 */
export function partial<const Ts extends Types, M extends Mutability = Mutability.Immutable>(
  obj: Lazy<ObjectType<any, Ts>>,
  mutable?: M,
  options?: OptionsOf<ObjectType<M, Ts>>,
): () => ObjectType<M, PartialObjectFields<Ts>> {
  if (typeof obj === 'function') {
    return () => partial(concretise(obj) as ObjectType<any, Ts>, mutable, options)()
  }
  const mappedFields = filterMapObject(obj.fields, (_, t) => (hasWrapper(t, Kind.Optional) ? t : types.optional(t)))
  const constructor = mutable === Mutability.Mutable ? types.mutableObject : types.object
  return () => constructor(mappedFields, options) as ObjectType<M, PartialObjectFields<Ts>>
}

type PartialObjectFields<Ts extends Types> = {
  [K in keyof Ts]: IsReference<Ts[K]> extends true ? Ts[K] : OptionalType<Ts[K]>
}

/**
 * Given a {@link Type} returns a new type where all the fields of object types are turned into
 * optional fields
 *
 * @example ```ts
 *          const model = types.number()
 *          types.Infer<types.PartialDeep<typeof model>> // number
 *          ```
 * @example ```ts
 *          const model = types.object({ field: number })
 *          types.Infer<types.PartialDeep<typeof model>> // { field?: number }
 *          ```
 * @example ```ts
 *          const model = types.object({ field: number }).array()
 *          types.Infer<types.PartialDeep<typeof model>> // { field?: number }[]
 *          ```
 */
//prettier-ignore
export type PartialDeep<T extends Type> 
  = [T] extends [UnionType<infer Ts>] ? UnionType<{ [Key in keyof Ts]: PartialDeep<Ts[Key]> }>
  : [T] extends [ObjectType<infer Mutability, infer Ts>] ? ObjectType<Mutability, { [Key in keyof Ts]: OptionalType<PartialDeep<Ts[Key]>> }>
  : [T] extends [ArrayType<infer Mutability, infer T1>] ? ArrayType<Mutability, PartialDeep<T1>>
  : [T] extends [OptionalType<infer T1>] ? OptionalType<PartialDeep<T1>>
  : [T] extends [NullableType<infer T1>] ? NullableType<PartialDeep<T1>>
  : [T] extends [ReferenceType<infer T1>] ? ReferenceType<PartialDeep<T1>>
  : [T] extends [(() => infer T1 extends Type)] ? () => PartialDeep<T1>
  : T

/**
 * @param type the type whose fields will be all turned into optional types
 * @returns a new {@link Type} where the fields of every {@link ObjectType} appearing in it is turned
 *          into an optional field
 * @example ```ts
 *          const model = types.object({ field: types.string() }).array()
 *          types.partialDeep(model)
 *          // -> same as types.object({ field: types.string().optional() }).array()
 *          ```
 */
export function partialDeep<T extends Type>(type: T): PartialDeep<T> {
  if (typeof type === 'function') {
    return (() => partialDeep(type())) as PartialDeep<T>
  }
  const concreteType = concretise(type)
  switch (concreteType.kind) {
    case Kind.Reference:
      return types.reference(partialDeep(concreteType.wrappedType)) as PartialDeep<T>
    case Kind.Nullable:
      return types.nullable(partialDeep(concreteType.wrappedType)) as PartialDeep<T>
    case Kind.Optional:
      return types.optional(partialDeep(concreteType.wrappedType)) as PartialDeep<T>
    case Kind.Array:
      return types.array(partialDeep(concreteType.wrappedType)) as PartialDeep<T>
    case Kind.Union:
      return types.union(
        mapObject(concreteType.variants as Record<string, Type>, (_, fieldValue) => partialDeep(fieldValue)),
      ) as PartialDeep<T>
    case Kind.Object:
      return types.object(
        mapObject(concreteType.fields as Record<string, Type>, (_, fieldValue) =>
          types.optional(partialDeep(fieldValue)),
        ),
      ) as PartialDeep<T>
    default:
      return type as PartialDeep<T>
  }
}

/**
 * TODO: add documentation and tests
 * @param one the first type to compare
 * @param other the second type to compare
 * @returns true if the two types model the same type
 */
export function areEqual(one: Type, other: Type): boolean {
  if (one == other) {
    return true //same pointer
  }
  const type1 = concretise(one)
  const type2 = concretise(other)

  function sameKindAndOptions(one: Concrete<Type>, other: Concrete<Type>): boolean {
    return one.kind === other.kind && one.options === other.options
  }

  function arraysHaveSameElements(array1: any[], array2: any[]): boolean {
    return array1.length === array2.length && array1.every((element) => array2.includes(element))
  }

  function sameFieldsAreSameTypes(one: Types, other: Types): boolean {
    const oneKeys = Object.keys(one)
    const otherKeys = Object.keys(other)
    return (
      arraysHaveSameElements(oneKeys, otherKeys) &&
      Object.entries(one).every(([fieldName, fieldType]) => areEqual(other[fieldName], fieldType))
    )
  }

  // prettier-ignore
  return (
       type1.kind === Kind.Number && sameKindAndOptions(type1, type2)
    || type1.kind === Kind.Boolean && sameKindAndOptions(type1, type2)
    || type1.kind === Kind.String && sameKindAndOptions(type1, type2)
    || (type1.kind === Kind.Literal && type1.kind === type2.kind && type1.options === type2.options && type1.literalValue === type2.literalValue)
    || (type1.kind === Kind.Enum && type1.kind === type2.kind && type1.options === type2.options && arraysHaveSameElements(type1.variants, type2.variants))
    || (type1.kind === Kind.Custom && type1.kind === type2.kind && type1.options === type2.options && type1.typeName === type2.typeName)
    || (type1.kind === Kind.Array && type1.kind === type2.kind && type1.options === type2.options && areEqual(type1.wrappedType, type2.wrappedType))
    || (type1.kind === Kind.Nullable && type1.kind === type2.kind && type1.options === type2.options && areEqual(type1.wrappedType, type2.wrappedType))
    || (type1.kind === Kind.Optional && type1.kind === type2.kind && type1.options === type2.options && areEqual(type1.wrappedType, type2.wrappedType))
    || (type1.kind === Kind.Reference && type1.kind === type2.kind && type1.options === type2.options && areEqual(type1.wrappedType, type2.wrappedType))
    || (type1.kind === Kind.Object && type1.kind === type2.kind && type1.options === type2.options && sameFieldsAreSameTypes(type1.fields, type2.fields))
    || (type1.kind === Kind.Union && type1.kind === type2.kind && type1.options === type2.options && sameFieldsAreSameTypes(type1.variants, type2.variants))
  )
}

/**
 * @param type the type to check against
 * @param value the value whose type needs to be checked
 * @param decodingOptions the {@link decoding.Options} used for the decoding process
 * @param validationOptions the {@link validation.Options} used for the validation process
 * @returns true if `value` is actually a valid member of the type `T`
 */
export function isType<T extends Type>(
  type: T,
  value: unknown,
  decodingOptions?: decoding.Options,
  validationOptions?: validation.Options,
): value is Infer<T> {
  return types
    .concretise(type)
    .decode(value, decodingOptions, validationOptions)
    .match(
      (_) => true,
      (_) => false,
    )
}

/**
 * @param type the type to check against
 * @param value the value whose type needs to be checked
 * @param decodingOptions the {@link DecodingOptions options} used for the decoding process
 * @param validationOptions the {@link ValidationOptions options} used for the validation process
 */
export function assertType<T extends Type>(
  type: T,
  value: unknown,
  decodingOptions?: decoding.Options,
  validationOptions?: validation.Options,
): asserts value is Infer<T> {
  types
    .concretise(type)
    .decode(value, decodingOptions, validationOptions)
    .match(
      (_) => {},
      (errors) => {
        throw new Error(`Invalid type: ${JSON.stringify(errors)}`)
      },
    )
}

function hasWrapper(type: Type, kind: Kind.Optional | Kind.Nullable | Kind.Reference | Kind.Array): boolean {
  const concreteType = concretise(type)
  const typeKind = concreteType.kind
  const isWrapperType = 'wrappedType' in concreteType
  return typeKind === kind || (isWrapperType && typeKind !== Kind.Array && hasWrapper(concreteType.wrappedType, kind))
}

/**
 * @param type the type to check
 * @returns true if the type is an optional type
 */
export function isOptional(type: Type): boolean {
  return hasWrapper(type, Kind.Optional)
}

/**
 * @param type the type to check
 * @returns true if the type is a nullable type
 */
export function isNullable(type: Type): type is Lazy<NullableType<Type>> {
  return hasWrapper(type, Kind.Nullable)
}

/**
 * @param type the type to check
 * @returns true if the type is a reference type
 */
export function isReference(type: Type): type is Lazy<ReferenceType<Type>> {
  return hasWrapper(type, Kind.Reference)
}

/**
 * @param type the type to check
 * @returns true if the type is an array type
 */
export function isArray(type: Type): type is Lazy<ArrayType<Mutability, Type>> {
  return hasWrapper(type, Kind.Array)
}

/**
 * Unwraps all wrappers around a {@link Type}.
 * The wrappers are: {@link OptionalType}, {@link NullableType}, {@link ReferenceType}, {@link ArrayType}
 * @param type the type to unwrap.
 * @returns the unwrapped type.
 */
export function unwrap(
  type: Type,
):
  | NumberType
  | StringType
  | EnumType<any>
  | BooleanType
  | CustomType<string, {}, unknown>
  | LiteralType<any>
  | ObjectType<Mutability, Types>
  | UnionType<Types> {
  const concreteType = concretise(type)
  return 'wrappedType' in concreteType ? unwrap(concreteType.wrappedType) : concreteType
}

/**
 * Checks if the {@link unwrap}ped type is a scalar type.
 * @param type the type to check
 * @returns false only for {@link ObjectType}, {@link UnionType}, {@link ArrayType}
 */
export function isScalar(type: Type): boolean {
  const unwrapped = unwrap(type)
  const notUnionOrObject = unwrapped.kind !== Kind.Union && unwrapped.kind !== Kind.Object
  return !isArray(type) && notUnionOrObject
}
