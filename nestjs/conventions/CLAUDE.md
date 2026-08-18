## Layered architecture

Split a feature across layers by what it's allowed to touch, not by REST
verb or by feature name alone:

- `api/` — controllers, guards, DTOs. Thin: parses/validates the request,
  delegates to `application/`, never contains business logic.
- `application/` — use cases. Orchestrates one or more domain services.
  Never queries the DB directly, never imports a repository directly.
- `domain/` — business logic and repositories. Repositories are private to
  their domain service — nothing outside `domain/` touches one directly.
- `infrastructure/` — DB client, external HTTP calls, framework glue
  (middleware, request context).

`domain/` and `application/` stay transport-agnostic: no Express
`Request`/`Response`, no HTTP status codes chosen outside a thrown
exception.

## Error handling

- `domain/` and `application/` throw NestJS `HttpException` subclasses
  (`NotFoundException`, `ForbiddenException`, ...) with your project's own
  error-code string as the body — never a raw hardcoded string inlined at
  the throw site, use a shared error-code constant/enum.
- Register `createHttpExceptionFilter` and `createAllExceptionsFilter`
  (`@lxtzfr/my-stack-nestjs/httpExceptionFilter`, `.../allExceptionsFilter`)
  globally once (`app.useGlobalFilters(...)`) — controllers never
  try/catch for this.
- Validate request payloads with `ZodPipe` (`@lxtzfr/my-stack-nestjs/zodPipe`)
  at the controller boundary — invalid input never reaches `application/`.

## Logging

Use `ContextLogger` (`@lxtzfr/my-stack-nestjs/contextLogger`) instead of
`@nestjs/common`'s `Logger` directly, so every log line is automatically
prefixed with the current request's id. Requires
`RequestContextMiddleware` (`@lxtzfr/my-stack-nestjs/requestContextMiddleware`)
applied globally in the root module — without it every prefix is just `-`.

| Layer | Logger? |
|---|---|
| `domain/` | no — pure logic |
| `application/` | significant events only |
| `api/` | auth/inbound errors |
| `infrastructure/` | external calls |

## Contributing back to my-stack

Bugs and generic/reusable code that belong to this kit's own domain
(request context, exception filters, the Zod pipe...) get fixed in the
`my-stack` repo itself, not patched locally — including bugs only
discovered indirectly.

While iterating on such a fix, `pnpm link ../my-stack/nestjs` (rebuild
after each edit) instead of committing every attempt. Check
`git diff package.json pnpm-lock.yaml` before moving on — some pnpm
versions rewrite the dependency entry to `link:...` despite only being
meant to touch `node_modules` — and `git checkout -- package.json
pnpm-lock.yaml` to discard that rewrite if present. Once the fix is
confirmed working, commit + push it in the `my-stack` repo, then restore
the real dependency here:

```sh
git checkout -- package.json pnpm-lock.yaml   # only if `pnpm link` rewrote them — see above
pnpm install                                   # drops the link, restores the real dependency
pnpm update @lxtzfr/my-stack-nestjs            # pulls in the just-pushed fix
```

## Keep this file itself concise

This block is synced into every project depending on
`@lxtzfr/my-stack-nestjs`, alongside any other installed kit's own block —
trim before adding. Prefer editing or replacing a point over appending a
new one.
