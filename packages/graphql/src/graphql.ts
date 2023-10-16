import { FunctionSpecifications, Api, ErrorHandler } from './api'
import { infoToProjection } from './utils'
import { createGraphQLError } from '@graphql-tools/utils'
import { projection, result, types } from '@mondrian-framework/model'
import { functions, logger as logging, module, utils } from '@mondrian-framework/module'
import { MondrianLogger } from '@mondrian-framework/module/src/logger'
import { JSONType, assertNever, capitalise, mapObject, toCamelCase } from '@mondrian-framework/utils'
import {
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLInt,
  getNullableType,
  GraphQLUnionType,
  GraphQLOutputType,
  GraphQLSchema,
  GraphQLResolveInfo,
  GraphQLFieldConfig,
} from 'graphql'

/**
 * TODO: vedere se negli scalari da un suggerimento su cosa inserire (numero/stringa)
 *
 */

/**
 * Turns a Mondrian type into an equivalent GraphQL type that can be used to
 * define GraphQL schemas.
 */
export function typeToGraphQLType(type: types.Type): GraphQLOutputType {
  return typeToGraphQLTypeInternal(types.concretise(type), {
    inspectedTypes: new Set(),
    knownTypes: new Map(),
    knownCustomTypes: new Map(),
    defaultName: undefined,
  })
}

/**
 * Generates a name for the given type with the following algorithm:
 * - If the type has a name uses that, otherwise
 * - If the default name is defined uses that, otherwise
 * - Generates a random name in the form "TYPE{N}" where "N" is a random integer
 */
function generateName(type: types.Type, defaultName: string | undefined): string {
  const concreteType = types.concretise(type)
  return concreteType.options?.name
    ? capitalise(concreteType.options.name)
    : defaultName ?? 'TYPE' + Math.floor(Math.random() * 100_000_000)
}

// Data used in the recursive calls of `typeToGraphQLTypeInternal` to store
// all relevant information that has to be used throughout the recursive calls.
type InternalData = {
  // A set of all the types that have already been explored
  inspectedTypes: Set<types.Type>
  // A map from <explored type> to already generated output type
  knownTypes: Map<types.Type, GraphQLOutputType>
  // A map for all custom types that have already been explored. Here we just
  // save their name
  knownCustomTypes: Map<string, GraphQLScalarType>
  // The default name to assign to the current type in the iteration process
  defaultName: string | undefined
}

function typeToGraphQLTypeInternal(type: types.Type, internalData: InternalData): GraphQLOutputType {
  const { inspectedTypes, knownTypes, defaultName } = internalData
  // If the type has already been explored, then return the output type that has
  // already been generated
  if (inspectedTypes.has(type)) {
    // ⚠️ Possible pain point: `typeToGraphQLTypeInternal` relies on the fact
    // that _every single type_ that appears in `inspectedTypes` must also have
    // an associated generated type here
    return knownTypes.get(type)!!
  } else {
    inspectedTypes.add(type)
    // ⚠️ Possible pain point: here the invariant that a type inside `exporedTypes`
    // must have a counterpart in the `knownTypes` map is broken and cannot be used
    // by the inner functions! This is unavoidable since this kind of caching is
    // only used by this top level function and the other inner functions should
    // not be aware of that.
    let graphQLType = undefined
    const concreteType = types.concretise(type)
    if (concreteType.kind === types.Kind.Number) {
      graphQLType = scalarOrDefault(concreteType, GraphQLInt, defaultName)
    } else if (concreteType.kind === types.Kind.String) {
      graphQLType = scalarOrDefault(concreteType, GraphQLString, defaultName)
    } else if (concreteType.kind === types.Kind.Boolean) {
      graphQLType = scalarOrDefault(concreteType, GraphQLBoolean, defaultName)
    } else if (concreteType.kind === types.Kind.Enum) {
      graphQLType = enumToGraphQLType(concreteType, defaultName)
    } else if (concreteType.kind === types.Kind.Literal) {
      graphQLType = literalToGraphQLType(concreteType, defaultName)
    } else if (concreteType.kind === types.Kind.Union) {
      graphQLType = unionToGraphQLType(concreteType, internalData)
    } else if (concreteType.kind === types.Kind.Object) {
      graphQLType = objectToGraphQLType(concreteType, internalData)
    } else if (concreteType.kind === types.Kind.Array) {
      graphQLType = arrayToGraphQLType(concreteType, internalData)
    } else if (concreteType.kind === types.Kind.Optional || concreteType.kind === types.Kind.Nullable) {
      const type = typeToGraphQLTypeInternal(concreteType.wrappedType, internalData)
      graphQLType = getNullableType(type)
    } else if (concreteType.kind === types.Kind.Custom) {
      graphQLType = customTypeToGraphQLType(concreteType, internalData)
    } else {
      assertNever(concreteType)
    }
    // Add the generated type to the map of explored types to make the invariant
    // valid once again
    knownTypes.set(type, graphQLType)
    return graphQLType
  }
}

// If the given type has some options then it is turned into a scalar (we assume
// that, since it has some options, it must be considered as a unique and distinct
// type from all others)
// If the type doesn't have any options then this function returns the provided
// default type
function scalarOrDefault<T extends types.Type>(
  type: T,
  defaultType: GraphQLOutputType,
  defaultName: string | undefined,
): GraphQLOutputType {
  const concreteType = types.concretise(type)
  const options = concreteType.options
  return !options ? defaultType : scalarFromType(concreteType, options.description, defaultName)
}

// Turns a type into a GraphQL scalar type
function scalarFromType<T extends types.Type>(
  type: types.Concrete<T>,
  description: string | undefined,
  defaultName: string | undefined,
): GraphQLScalarType<types.Infer<T>, JSONType> {
  const name = generateName(type, defaultName)
  const serialize = (value: unknown) => {
    if (!types.isType(type, value)) {
      throw createGraphQLError('Unexpected type in serialize')
    } else {
      const result = type.encode(value as never)
      if (result.isOk) {
        return result.value
      } else {
        throw createGraphQLError('GraphQL serialization failed')
      }
    }
  }
  // TODO: add parseValue and parseLiteral
  return new GraphQLScalarType<types.Infer<T>, JSONType>({ name, description, serialize })
}

function enumToGraphQLType(
  enumeration: types.EnumType<readonly [string, ...string[]]>,
  defaultName: string | undefined,
): GraphQLEnumType {
  const name = generateName(enumeration, defaultName)
  const variants = enumeration.variants.map((variant, index) => [variant, { value: index }])
  const values = Object.fromEntries(variants)
  return new GraphQLEnumType({ name, values })
}

// Turns a literal into a GraphQL enum with a single value that represents the
// given literal value.
function literalToGraphQLType(
  literal: types.LiteralType<number | string | null | boolean>,
  defaultName: string | undefined,
): GraphQLEnumType {
  const name = generateName(literal, defaultName)
  const rawLiteralName = literal.literalValue?.toString().trim() ?? 'null'
  const literalName = `Literal${toCamelCase(rawLiteralName)}`
  const values = Object.fromEntries([[literalName, { value: 0 }]])
  return new GraphQLEnumType({ name, values })
}

function arrayToGraphQLType(
  array: types.ArrayType<any, any>,
  internalData: InternalData,
): GraphQLList<GraphQLOutputType> {
  const { defaultName } = internalData
  const arrayName = generateName(array, defaultName)
  const itemDefaultName = arrayName + 'Item'
  const itemsType = typeToGraphQLTypeInternal(array.wrappedType, { ...internalData, defaultName: itemDefaultName })
  const wrappedType = types.isOptional(array.wrappedType) ? itemsType : new GraphQLNonNull(itemsType)
  return new GraphQLList(wrappedType)
}

function objectToGraphQLType(
  object: types.ObjectType<any, types.Types>,
  internalData: InternalData,
): GraphQLObjectType {
  const { defaultName } = internalData
  const objectName = generateName(object, defaultName)
  const fields = () => mapObject(object.fields, typeToGraphQLObjectField(internalData, objectName))
  return new GraphQLObjectType({ name: objectName, fields })
}

function typeToGraphQLObjectField(
  internalData: InternalData,
  objectName: string,
): (fieldName: string, fieldType: types.Type) => { type: GraphQLOutputType } {
  return (fieldName, fieldType) => {
    const fieldDefaultName = generateName(fieldType, objectName + capitalise(fieldName))
    const concreteType = types.concretise(fieldType)
    const graphQLType = typeToGraphQLTypeInternal(concreteType, { ...internalData, defaultName: fieldDefaultName })
    const canBeMissing = types.isOptional(concreteType) || types.isNullable(concreteType)
    return { type: canBeMissing ? graphQLType : new GraphQLNonNull(graphQLType) }
  }
}

function unionToGraphQLType(union: types.UnionType<types.Types>, internalData: InternalData): GraphQLUnionType {
  const { defaultName } = internalData
  const unionName = generateName(union, defaultName)
  const types = Object.entries(union.variants).map(([name, variantType]) => {
    const variantName = unionName + capitalise(name)
    const variantValueDefaultName = name + 'Value'
    const value = typeToGraphQLTypeInternal(variantType, { ...internalData, defaultName: variantValueDefaultName })
    const field = Object.fromEntries([[name, { type: value }]])
    return new GraphQLObjectType({ name: variantName, fields: field })
  })
  return new GraphQLUnionType({ name: unionName, types })
}

function customTypeToGraphQLType(
  type: types.CustomType<string, any, any>,
  internalData: InternalData,
): GraphQLScalarType {
  const { knownCustomTypes } = internalData
  const knownType = knownCustomTypes.get(type.typeName)
  if (knownType) {
    return knownType
  } else {
    const scalar = scalarFromType(type, type.options?.description, capitalise(type.typeName))
    knownCustomTypes.set(type.typeName, scalar)
    return scalar
  }
}

export type FromModuleInput<ServerContext, Fs extends functions.Functions, ContextInput> = {
  module: module.Module<Fs, ContextInput>
  api: Api<Fs>
  context: (server: ServerContext, info: GraphQLResolveInfo) => Promise<ContextInput>
  setHeader: (server: ServerContext, name: string, value: string) => void
  errorHandler?: ErrorHandler<Fs, ServerContext>
}

export function fromModule<const ServerContext, const Fs extends functions.Functions, const ContextInput>(
  input: FromModuleInput<ServerContext, Fs, ContextInput>,
): GraphQLSchema {
  const { module, api, context, setHeader, errorHandler } = input
  const moduleFunctions = Object.entries(module.functions)
  const queriesArray = moduleFunctions.flatMap(([name, fun]) =>
    toQueries(module.name, fun, api.functions[name], setHeader, context, module.context, errorHandler),
  )
  const mutationsArray = moduleFunctions.flatMap(([name, fun]) =>
    toMutations(module.name, fun, api.functions[name], setHeader, context, module.context, errorHandler),
  )
  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'query', fields: Object.fromEntries(queriesArray) }),
    mutation: new GraphQLObjectType({ name: 'mutation', fields: Object.fromEntries(mutationsArray) }),
  })
}

/**
 * Turns a function into the list of queries defined by its specification(s).
 * Each query is tagged by its name as defined by the specification.
 */
function toQueries(
  moduleName: string,
  fun: functions.FunctionImplementation,
  spec: FunctionSpecifications | readonly FunctionSpecifications[] | undefined,
  setHeader: (server: any, name: string, value: string) => void,
  getContextInput: (server: any, info: GraphQLResolveInfo) => Promise<any>,
  getModuleContext: any,
  errorHandler: ErrorHandler<any, any> | undefined,
): [string, GraphQLFieldConfig<any, any>][] {
  return asSpecs(spec)
    .filter((spec) => spec.type === 'query')
    .map((spec, i) => {
      const queryName = spec.name ?? `query${i}`
      return makeOperation(
        'query',
        moduleName,
        queryName,
        fun,
        setHeader,
        getContextInput,
        getModuleContext,
        errorHandler,
      )
    })
}

/**
 * Turns a function into the list of mutations defined by its specification(s).
 * Each mutations is tagged by its name as defined by the specification.
 */
function toMutations(
  moduleName: string,
  fun: functions.FunctionImplementation,
  spec: FunctionSpecifications | readonly FunctionSpecifications[] | undefined,
  setHeader: (server: any, name: string, value: string) => void,
  getContextInput: (server: any, info: GraphQLResolveInfo) => Promise<any>,
  getModuleContext: any,
  errorHandler: ErrorHandler<any, any> | undefined,
): [string, GraphQLFieldConfig<any, any>][] {
  return asSpecs(spec)
    .filter((spec) => spec.type === 'mutation')
    .map((spec, i) => {
      const mutationName = spec.name ?? `mutation${i}`
      return makeOperation(
        'mutation',
        moduleName,
        mutationName,
        fun,
        setHeader,
        getContextInput,
        getModuleContext,
        errorHandler,
      )
    })
}

/**
 * Turns a spec as obtained by the API into a single list that is easier to work with.
 */
function asSpecs(
  spec: FunctionSpecifications | readonly FunctionSpecifications[] | undefined,
): FunctionSpecifications[] {
  if (spec === undefined) {
    return []
  } else if (spec instanceof Array) {
    return [...spec]
  } else {
    return [spec]
  }
}

function makeOperation(
  operationType: 'query' | 'mutation',
  moduleName: string,
  queryName: string,
  fun: functions.FunctionImplementation,
  setHeader: (server: any, name: string, value: string) => void,
  getContextInput: (server: any, info: GraphQLResolveInfo) => Promise<any>,
  getModuleContext: any,
  errorHandler: ErrorHandler<any, any> | undefined,
): [string, GraphQLFieldConfig<any, any>] {
  const resolve = async (
    _parent: unknown,
    resolverInput: Record<string, unknown>,
    serverContext: unknown,
    info: GraphQLResolveInfo,
  ) => {
    // Setup logging
    const operationId = utils.randomOperationId()
    const logger = logging.build({ moduleName, operationId, operationType, operationName: queryName, server: 'GQL' })
    setHeader(serverContext, 'operation-id', operationId)

    // Decode all the needed bits to call the function
    const graphQLInputTypeName = 'TODO' // TODO: Where do I get this?
    const input = decodeInput(fun.input, resolverInput[graphQLInputTypeName], logger) as never
    const projection = decodeProjection(fun, infoToProjection(info, fun.output), logger)
    const partialOutputType = types.partialDeep(fun.output)

    // Retrieve the contexts
    const inputContext = await getContextInput(serverContext, info)
    const context = await getModuleContext(inputContext, { projection, input, operationId, logger })

    // Call the function and handle a possible failure
    const contexts = { serverContext, context }
    const handlerInput = { logger, operationId, functionName: queryName, projection, input, errorHandler, ...contexts }
    return fun
      .apply({ context: context, projection, input, operationId, logger })
      .then((res) => handleFunctionResult(res, partialOutputType, handlerInput))
      .catch((error) => handleFunctionError({ ...handlerInput, error }))
  }

  return [queryName, { type: typeToGraphQLType(fun.output), resolve }]
}

function decodeInput(inputType: types.Type, rawInput: unknown, log: MondrianLogger) {
  const decoded = types.concretise(inputType).decode(rawInput, { typeCastingStrategy: 'tryCasting' })
  if (decoded.isOk) {
    log.logInfo('Input decoded')
    return decoded.value
  } else {
    log.logError('Bad request. (input)')
    throw createGraphQLError(`Invalid input.`, { extensions: decoded.error })
  }
}

function decodeProjection(fun: functions.FunctionImplementation, proj: projection.Projection, log: MondrianLogger) {
  const res = projection.decode(fun.output, proj, { typeCastingStrategy: 'tryCasting' })
  if (res.isOk) {
    log.logInfo('decoded projection')
    return res.value
  } else {
    log.logError('Bad request. (projection)')
    throw createGraphQLError(`Invalid input.`, { extensions: res.error })
  }
}

function handleFunctionResult(
  res: result.Result<any, any>,
  partialOutputType: types.Type,
  handleErrorInput: Omit<HandleErrorInput, 'error'>,
) {
  if (result.isFailureResult(res)) {
    handleFunctionError({ ...handleErrorInput, error: res.error })
  } else {
    const value = result.isOkResult(res) ? res.value : res
    const encodedOutput = types.concretise(partialOutputType).encodeWithoutValidation(value as never)
    handleErrorInput.logger.logInfo('Completed.')
    return encodedOutput
  }
}

type HandleErrorInput = {
  functionName: string
  operationId: string
  logger: MondrianLogger
  context: unknown
  serverContext: any
  projection: projection.Projection
  input: unknown
  errorHandler: ErrorHandler<any, any> | undefined
  error: unknown
}

async function handleFunctionError(handleErrorInput: HandleErrorInput) {
  const { error, logger: log, errorHandler } = handleErrorInput
  log.logError('Failed with error.')
  if (!errorHandler) {
    throw error
  } else {
    log.logInfo('Performing cleanup action.')
    const { context, serverContext, operationId, input, functionName, projection } = handleErrorInput
    const functionArgs = { projection, input }
    const errorHandlerInput = { error, log, functionName, operationId, context, functionArgs, ...serverContext }
    const result = await errorHandler(errorHandlerInput)
    if (result) {
      throw createGraphQLError(result.message, result.options)
    } else {
      throw error
    }
  }
}
