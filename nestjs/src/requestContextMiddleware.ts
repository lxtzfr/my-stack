import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { generateRequestId, requestContext } from './requestContext'

/** Wire up once, globally, ahead of any route (e.g. `consumer.apply(RequestContextMiddleware).forRoutes('*')`
 *  in your root module's `configure()`). Every downstream `ContextLogger` call within the same request
 *  then automatically carries the same request id, with no need to thread it through function signatures. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    requestContext.run({ requestId: generateRequestId() }, next)
  }
}
