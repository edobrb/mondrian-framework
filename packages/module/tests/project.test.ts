import { Project } from '../src/sdk'
import { types } from '@mondrian-framework/model'
import { describe, expectTypeOf, test } from 'vitest'

describe('Project', () => {
  test('Infer scalar on scalar type with any projection', () => {
    expectTypeOf<Project<types.NumberType, {}>>().toEqualTypeOf<number>()
    expectTypeOf<Project<types.NumberType, true>>().toEqualTypeOf<number>()
    expectTypeOf<Project<types.StringType, {}>>().toEqualTypeOf<string>()
    expectTypeOf<Project<types.StringType, true>>().toEqualTypeOf<string>()
    expectTypeOf<Project<types.BooleanType, {}>>().toEqualTypeOf<boolean>()
    expectTypeOf<Project<types.BooleanType, true>>().toEqualTypeOf<boolean>()
    expectTypeOf<Project<types.LiteralType<null>, {}>>().toEqualTypeOf<null>()
    expectTypeOf<Project<types.LiteralType<null>, true>>().toEqualTypeOf<null>()
    expectTypeOf<Project<types.DateTimeType, {}>>().toEqualTypeOf<Date>()
    expectTypeOf<Project<types.DateTimeType, true>>().toEqualTypeOf<Date>()
    expectTypeOf<Project<types.EnumType<['A']>, {}>>().toEqualTypeOf<'A'>()
    expectTypeOf<Project<types.EnumType<['A']>, true>>().toEqualTypeOf<'A'>()
    expectTypeOf<Project<() => types.NumberType, {}>>().toEqualTypeOf<number>()
    expectTypeOf<Project<() => types.NumberType, true>>().toEqualTypeOf<number>()
  })

  test('Infer scalar on scalar type with any projection with wrapper', () => {
    expectTypeOf<Project<types.NullableType<types.NumberType>, {}>>().toEqualTypeOf<number | null>()
    expectTypeOf<Project<types.OptionalType<types.NumberType>, {}>>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Project<types.ArrayType<'mutable', types.NumberType>, {}>>().toEqualTypeOf<number[]>()
    expectTypeOf<Project<types.ReferenceType<types.NumberType>, {}>>().toEqualTypeOf<number>()
  })

  test('simple object', () => {
    const user = types.object({ field1: types.string(), field2: types.string() })
    type UserType = typeof user
    expectTypeOf<Project<UserType, {}>>().toEqualTypeOf<Readonly<{}>>()
    expectTypeOf<Project<UserType, { field1: true }>>().toEqualTypeOf<Readonly<{ field1: string }>>()
    expectTypeOf<Project<UserType, true>>().toEqualTypeOf<types.Infer<UserType>>()
  })

  test('recursive object with reference', () => {
    const user = () =>
      types.object({ field1: types.string(), field2: types.string(), friend: types.optional(user).reference() })
    type UserType = typeof user
    expectTypeOf<Project<UserType, {}>>().toEqualTypeOf<Readonly<{}>>()
    expectTypeOf<Project<UserType, { field1: true }>>().toEqualTypeOf<Readonly<{ field1: string }>>()
    expectTypeOf<Project<UserType, true>>().toEqualTypeOf<Readonly<{ field1: string; field2: string }>>()
    expectTypeOf<Project<UserType, { friend: true }>>().toEqualTypeOf<
      Readonly<{ friend?: Readonly<{ field1: string; field2: string }> }>
    >()
  })

  test('simple union', () => {
    const union = types.union({
      s: types.object({ field1: types.string(), field2: types.reference(types.number()) }),
      n: types.number(),
    })
    type UnionType = typeof union
    expectTypeOf<Project<UnionType, {}>>().toEqualTypeOf<Readonly<{ n: number } | { s: Readonly<{}> }>>()
    expectTypeOf<Project<UnionType, { s: true }>>().toEqualTypeOf<
      Readonly<{ n: number } | { s: Readonly<{ field1: string }> }>
    >()
    expectTypeOf<Project<UnionType, { s: { field2: true } }>>().toEqualTypeOf<
      Readonly<{ n: number } | { s: Readonly<{ field2: number }> }>
    >()
    expectTypeOf<Project<UnionType, true>>().toEqualTypeOf<
      Readonly<{ n: number } | { s: Readonly<{ field1: string }> }>
    >()
  })
})
