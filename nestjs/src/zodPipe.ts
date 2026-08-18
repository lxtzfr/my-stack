import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/** Validates a request payload against a Zod schema, throwing a `BadRequestException`
 *  with a structured `issues` list on failure instead of letting bad input reach your
 *  application layer. `errorCode` is your own project's error-code string for this
 *  case (defaults to a generic one) — kept a plain string rather than an enum import
 *  so this package never needs to know your project's error-code type. */
@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(
    private readonly schema: ZodType<T>,
    private readonly errorCode = 'INVALID_PAYLOAD',
  ) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        error: this.errorCode,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    return result.data
  }
}
