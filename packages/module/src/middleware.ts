import { errors, functions, logger, retrieve, security, utils } from '.'
import { checkPolicies as checkPolicyInternal } from './security'
import { result, model, decoding, validation, path } from '@mondrian-framework/model'
import { buildErrorMessage } from '@mondrian-framework/utils'

/**
 * This middleware checks if the requested selection does not exceed the maximum given depth.
 * @param maxDepth the maximum depth.
 */
export function checkMaxSelectionDepth(
  maxDepth: number,
): functions.Middleware<model.Type, model.Type, functions.ErrorType, functions.OutputRetrieveCapabilities, {}> {
  return {
    name: 'Check max selection depth',
    apply: (args, next, thisFunction) => {
      const depth = retrieve.selectionDepth(thisFunction.output, args.retrieve ?? {})
      if (depth > maxDepth) {
        throw new errors.MaxSelectionDepthReached(depth, maxDepth)
      }
      return next(args)
    },
  }
}

/**
 * This middleware checks if the result is compatible with the function's output type and also if it's respecting the given projection.
 * Returning more fields than requested is allowed and the additional fields will be trimmed out.
 * @param onFailure the action to take on failure.
 */
export function checkOutputType(
  functionName: string,
  onFailure: 'log' | 'throw',
): functions.Middleware<model.Type, model.Type, functions.ErrorType, functions.OutputRetrieveCapabilities, {}> {
  return {
    name: 'Check output type',
    apply: async (args, next, thisFunction) => {
      const nextRes: result.Result<unknown, unknown> | unknown = await next(args)
      if (thisFunction.errors && (nextRes as result.Result<unknown, unknown>).isFailure) {
        //Checks the error type
        const errorDecodeResult = utils.decodeFunctionFailure(
          (nextRes as result.Failure<unknown>).error,
          thisFunction.errors,
          {
            errorReportingStrategy: 'allErrors',
            fieldStrictness: 'expectExactFields',
          },
        )
        if (errorDecodeResult.isFailure) {
          handleFailure({ onFailure, functionName, logger: args.logger, result: errorDecodeResult })
        }
        return errorDecodeResult.isOk ? result.fail(errorDecodeResult.value) : nextRes
      }

      //Unwrap the value
      let outputValue
      if (thisFunction.errors) {
        outputValue = (nextRes as result.Ok<unknown>).value
      } else {
        outputValue = nextRes
      }
      const retrieveType = retrieve.fromType(thisFunction.output, thisFunction.retrieve)
      const defaultRetrieve = retrieveType.isOk ? { select: {} } : {}

      const typeToRespect = retrieve.selectedType(thisFunction.output, args.retrieve ?? defaultRetrieve)
      const valueDecodeResult = model.concretise(typeToRespect).decode(outputValue as never, {
        errorReportingStrategy: 'allErrors',
        fieldStrictness: 'allowAdditionalFields',
      })

      if (valueDecodeResult.isFailure) {
        handleFailure({ onFailure, functionName, logger: args.logger, result: valueDecodeResult })
        return outputValue
      } else if (thisFunction.errors) {
        return result.ok(valueDecodeResult.value)
      } else {
        return valueDecodeResult.value
      }
    },
  }
}

function handleFailure({
  onFailure,
  logger,
  result,
  functionName,
}: {
  result: result.Failure<decoding.Error[] | validation.Error[]>
  onFailure: 'log' | 'throw'
  logger: logger.MondrianLogger
  functionName: string
}): void {
  if (onFailure === 'log') {
    logger.logWarn(
      buildErrorMessage(`Invalid value returned by the function ${functionName}`, 'module/middleware/checkOutputType'),
      {
        retrieve: JSON.stringify(retrieve),
        errors: Object.fromEntries(
          result.error.map((v, i) => [i, { ...v, gotJSON: JSON.stringify(v.got), got: `${v.got}`, path: v.path }]),
        ),
      },
    )
  } else {
    throw new errors.InvalidOutputValue(functionName, result.error)
  }
}

/**
 * This middleware applies the given security policies for a retrieve operation.
 * In case the checks fails and {@link errors.UnauthorizedAccess} is thrown
 */
export function checkPolicies(
  policies: (context: any) => security.Policies,
): functions.Middleware<model.Type, model.Type, functions.ErrorType, functions.OutputRetrieveCapabilities, {}> {
  return {
    name: 'Check policies',
    apply: (args, next, thisFunction) => {
      const res = checkPolicyInternal({
        outputType: thisFunction.output,
        retrieve: args.retrieve,
        policies: policies(args.context),
        capabilities: thisFunction.retrieve,
        path: path.root,
      })
      if (!res.isOk) {
        throw new errors.UnauthorizedAccess(res.error)
      }
      return next({ ...args, retrieve: res.value ?? {} })
    },
  }
}
