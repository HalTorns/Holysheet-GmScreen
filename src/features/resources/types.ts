import type { FunctionReturnType } from 'convex/server'

import type { api } from '@convex/_generated/api'

export type Resource = FunctionReturnType<
  typeof api.resources.list
>['page'][number]
