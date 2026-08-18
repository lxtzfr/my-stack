import { Logger } from '@nestjs/common'
import { getRequestId } from './requestContext'

/** Drop-in replacement for `new Logger(context)` that prefixes every line with the current
 *  request's id (from `requestContext.ts`), so concurrent requests' interleaved log lines
 *  stay distinguishable. Falls back to `-` outside a request (startup, cron, etc.). */
export class ContextLogger {
  private readonly logger: Logger

  constructor(context: string) {
    this.logger = new Logger(context)
  }

  private prefix(): string {
    return `[${getRequestId()}]`
  }

  log(message: string): void {
    this.logger.log(`${this.prefix()} ${message}`)
  }

  warn(message: string): void {
    this.logger.warn(`${this.prefix()} ${message}`)
  }

  error(message: string, stack?: string): void {
    this.logger.error(`${this.prefix()} ${message}`, stack)
  }

  debug(message: string): void {
    this.logger.debug(`${this.prefix()} ${message}`)
  }
}
