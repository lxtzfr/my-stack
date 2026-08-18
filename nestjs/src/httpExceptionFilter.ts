import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ContextLogger } from './contextLogger.js'

export interface HttpExceptionFilterOptions {
  /** Runs before the default body formatting — return a response body to short-circuit it
   *  (e.g. to reshape a library-specific exception like `nestjs-zod`'s `ZodValidationException`
   *  into your project's own error shape). Returning `undefined` falls through to the default. */
  formatException?: (exception: HttpException) => Record<string, unknown> | undefined
  /** Logger context name, i.e. what shows up in the log line's bracketed prefix. */
  loggerContext?: string
}

/** Catches every `HttpException` thrown anywhere in the app (guards, pipes, your own
 *  `throw new NotFoundException(...)` calls), logs it (`error` at 5xx, `warn` below), and
 *  writes a JSON response. Register once, globally — e.g. `app.useGlobalFilters(createHttpExceptionFilter())`
 *  — rather than importing `HttpExceptionFilter` per-controller. Pair with `createAllExceptionsFilter`
 *  for exceptions that *aren't* an `HttpException` (unexpected throws, driver errors, ...). */
export function createHttpExceptionFilter(options: HttpExceptionFilterOptions = {}) {
  const loggerContext = options.loggerContext ?? 'HttpExceptionFilter'

  @Catch(HttpException)
  class ConfiguredHttpExceptionFilter implements ExceptionFilter {
    #logger = new ContextLogger(loggerContext)

    catch(exception: HttpException, host: ArgumentsHost) {
      const ctx = host.switchToHttp()
      const response = ctx.getResponse<Response>()
      const request = ctx.getRequest<Request>()
      const status = exception.getStatus()

      const custom = options.formatException?.(exception)
      if (custom) {
        this.#logger.warn(`${request.method} ${request.url} — ${JSON.stringify(custom)}`)
        response.status(status).json(custom)
        return
      }

      if (status >= 500) {
        this.#logger.error(`${request.method} ${request.url} ${exception.message}`, exception.stack)
      } else {
        this.#logger.warn(`${request.method} ${request.url} ${exception.message}`)
      }

      const body = exception.getResponse()
      response.status(status).json(typeof body === 'string' ? { error: body } : body)
    }
  }

  return ConfiguredHttpExceptionFilter
}
