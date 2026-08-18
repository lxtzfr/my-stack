import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ContextLogger } from './contextLogger.js'

export interface AllExceptionsFilterOptions {
  /** Body's `error` field for the 500 response. Defaults to a generic code — pass your own
   *  project's "unexpected error" error-code string here. */
  errorCode?: string
  loggerContext?: string
}

/** Last-resort catch-all for anything that *isn't* an `HttpException` — a thrown non-Error
 *  value, a DB driver error, a bug. Always logs at `error` and always responds 500; never
 *  leaks the exception's own message to the client. Register alongside `createHttpExceptionFilter`,
 *  since Nest only runs the first filter whose `@Catch()` type matches (`@Catch()` with no
 *  argument here matches everything the other one didn't). */
export function createAllExceptionsFilter(options: AllExceptionsFilterOptions = {}) {
  const errorCode = options.errorCode ?? 'INTERNAL_ERROR'
  const loggerContext = options.loggerContext ?? 'AllExceptionsFilter'

  @Catch()
  class ConfiguredAllExceptionsFilter implements ExceptionFilter {
    #logger = new ContextLogger(loggerContext)

    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp()
      const response = ctx.getResponse<Response>()
      const request = ctx.getRequest<Request>()

      const message = exception instanceof Error ? exception.message : String(exception)
      const stack = exception instanceof Error ? exception.stack : undefined
      this.#logger.error(`${request.method} ${request.url} — unhandled: ${message}`, stack)

      response.status(500).json({ error: errorCode })
    }
  }

  return ConfiguredAllExceptionsFilter
}
