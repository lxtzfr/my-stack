# @lxtzfr/my-stack-nestjs

Generic NestJS request-lifecycle plumbing — request-scoped logging, global
exception filters, Zod validation. No business logic, no assumptions about
what your API is about: error codes, response shapes and everything else
project-specific stay config you pass in.

**Each piece is its own subpath import** (`@lxtzfr/my-stack-nestjs/contextLogger`,
not a flat barrel) — same reasoning as the TanStack kit: importing one
piece should never force evaluation of unrelated modules.

## What's in here

- **`@lxtzfr/my-stack-nestjs/requestContext`** — `requestContext` / `getRequestId` /
  `generateRequestId`: an `AsyncLocalStorage`-backed per-request id, so
  concurrent requests' log lines stay distinguishable without threading an
  id through every function signature.
- **`@lxtzfr/my-stack-nestjs/requestContextMiddleware`** — `RequestContextMiddleware`:
  wires up `requestContext` for every incoming request. Apply it globally,
  ahead of everything else:
  ```ts
  import { MiddlewareConsumer, Module } from '@nestjs/common'
  import { RequestContextMiddleware } from '@lxtzfr/my-stack-nestjs/requestContextMiddleware'

  export class AppModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(RequestContextMiddleware).forRoutes('*')
    }
  }
  ```
- **`@lxtzfr/my-stack-nestjs/contextLogger`** — `ContextLogger`: drop-in
  replacement for `new Logger(context)` that prefixes every line with the
  current request's id.
- **`@lxtzfr/my-stack-nestjs/zodPipe`** — `ZodPipe`: validates a request
  payload against a Zod schema, throwing a structured `BadRequestException`
  (with an `issues` list) on failure instead of letting bad input reach
  your application layer:
  ```ts
  import { ZodPipe } from '@lxtzfr/my-stack-nestjs/zodPipe'

  @Post()
  create(@Body(new ZodPipe(CreateUserSchema, 'INVALID_PAYLOAD')) body: CreateUserDto) {}
  ```
- **`@lxtzfr/my-stack-nestjs/httpExceptionFilter`** — `createHttpExceptionFilter`:
  a global filter for every `HttpException` (guards, pipes, your own
  `throw new NotFoundException(...)`) — logs it (`error` at 5xx, `warn`
  below) and writes a JSON response. `formatException` lets you reshape a
  library-specific exception (e.g. `nestjs-zod`'s `ZodValidationException`)
  before the default body formatting kicks in.
- **`@lxtzfr/my-stack-nestjs/allExceptionsFilter`** — `createAllExceptionsFilter`:
  a last-resort catch-all for anything that *isn't* an `HttpException` — logs
  at `error` and always responds a generic 500, never leaking the
  exception's own message to the client.

## Usage

```ts
import { NestFactory } from '@nestjs/core'
import { createHttpExceptionFilter } from '@lxtzfr/my-stack-nestjs/httpExceptionFilter'
import { createAllExceptionsFilter } from '@lxtzfr/my-stack-nestjs/allExceptionsFilter'
import { AppModule } from './app.module.js'

const app = await NestFactory.create(AppModule)
app.useGlobalFilters(
  createAllExceptionsFilter({ errorCode: 'INTERNAL_ERROR' }),
  createHttpExceptionFilter(),
)
await app.listen(3000)
```

Register `RequestContextMiddleware` in your root module (see above) so
`ContextLogger` and the two filters all see the same request id.

## Install

```json
{
  "dependencies": {
    "@lxtzfr/my-stack-nestjs": "github:lxtzfr/my-stack#path:nestjs"
  },
  "devDependencies": {
    "@lxtzfr/my-stack-core": "github:lxtzfr/my-stack#path:core"
  }
}
```

`@lxtzfr/my-stack-core` is optional but recommended — see "Conventions for
AI coding assistants" below for what it sets up.

`zod` is only needed if you actually import `@lxtzfr/my-stack-nestjs/zodPipe`
— declared as an optional peer, not a hard dependency, so consumers who
only want the logging/filter pieces never need it installed.

## Conventions for AI coding assistants

Also installing `@lxtzfr/my-stack-core` (see Install above) drops a
one-line pointer into your project's own `CLAUDE.md`, delimited by
`<!-- @lxtzfr/my-stack-nestjs:conventions:start/end -->` markers, telling
an AI coding assistant to read `node_modules/@lxtzfr/my-stack-nestjs/conventions/
CLAUDE.md` for the actual architectural conventions (domain/application/api
layering, error handling, contributing fixes back upstream, etc.) — a
pointer rather than a copy, so there's nothing to fall out of sync when the
conventions themselves change. Re-run manually with:

```sh
npx my-stack-sync-conventions
```

## Not in here (on purpose)

Auth guards, tenant resolution, DB/repository base classes, error-code
enums — all of that is specific to what your API is about. This package
only owns the generic request lifecycle: an id per request, consistent
logging, and a place for unhandled/handled exceptions to become a
response.
