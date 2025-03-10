import { assertApiValidity } from './utils'
import { functions, logger, module, retrieve } from '@mondrian-framework/module'
import { KeysOfUnion, http } from '@mondrian-framework/utils'
import { OpenAPIV3_1 } from 'openapi-types'

/**
 * The REST API specification of a mondrian {@link module.ModuleInterface ModuleInterface}
 * This contains all information needed to generate an openapi specification document.
 * It does not contains the implementation. In order to instantiate this you should use {@link define}.
 */
export type ApiSpecification<Fs extends functions.FunctionsInterfaces> = {
  /**
   * The current api version. Must be an integer greater than or quelas to 1.
   */
  version: number
  /**
   * Functions specification map.
   */
  functions: {
    [K in keyof Fs]?: FunctionSpecifications<Fs[K]> | FunctionSpecifications<Fs[K]>[]
  }
  options?: {
    /**
     * Endpoints will be populated without the domain part if not specified
     */
    endpoints?: string[]
    /**
     * Default is /api
     */
    pathPrefix?: string
  }
  /**
   * Available openapi securities. The key is used as reference in the function specification.
   */
  securities?: Record<string, OpenAPIV3_1.SecuritySchemeObject>
  /**
   * Shared error codes.
   */
  errorCodes?: {
    [K in KeysOfUnion<
      {
        [K2 in keyof Fs]: Exclude<Fs[K2]['errors'], undefined> extends never
          ? never
          : Exclude<Fs[K2]['errors'], undefined>
      }[keyof Fs]
    >]?: number
  }
  /**
   * Interface of the module
   */
  module: module.ModuleInterface<Fs>
}

/**
 * The same of {@link ApiSpecification} but this contains the {@link module.Module Module} so
 * this contains also the function implementations. With an instance of {@link Api} it is possible
 * to serve the module with a rest server. In order to instantiate this you should use {@link build}.
 */
export type Api<Fs extends functions.Functions, ContextInput> = ApiSpecification<Fs> & {
  /**
   * Module to serve
   */
  module: module.Module<Fs, ContextInput>
}

/**
 * Builds a REST API in order to expose the module.
 */
export function build<const Fs extends functions.Functions, ContextInput>(
  api: Api<Fs, ContextInput>,
): Api<Fs, ContextInput> {
  assertApiValidity(api)
  return api
}

/**
 * Defines the REST API with just the module interface.
 */
export function define<const Fs extends functions.FunctionsInterfaces>(
  api: ApiSpecification<Fs>,
): ApiSpecification<Fs> {
  assertApiValidity(api)
  return api
}

export type ErrorHandler<Fs extends functions.Functions, RestContext> = (
  args: {
    error: unknown
    logger: logger.MondrianLogger
    functionName: keyof Fs
    context: unknown
    tracer: functions.Tracer
    functionArgs: {
      retrieve?: retrieve.GenericRetrieve
      input?: unknown
    }
  } & RestContext,
) => Promise<http.Response | void>

export type FunctionSpecifications<F extends functions.FunctionInterface = functions.FunctionInterface> = {
  method: http.Method
  path?: string
  inputName?: string
  version?: { min?: number; max?: number }
  openapi?: {
    specification: NullableOperationObject
    input: (request: http.Request) => unknown
  }
  errorCodes?: { [K in keyof Exclude<F['errors'], undefined>]?: number }
  namespace?: string | null
  security?: OpenAPIV3_1.SecurityRequirementObject[]
  contentType?: string
}

type NullableOperationObject = {
  [K in keyof OpenAPIV3_1.OperationObject]: OpenAPIV3_1.OperationObject[K] | null
}

/**
 * Options used by the REST server
 */
export type ServeOptions = {
  readonly introspection?: { path: string } | false
}

/**
 * Default options used by the REST server
 */
export const DEFAULT_SERVE_OPTIONS: ServeOptions = {
  introspection: false,
}
