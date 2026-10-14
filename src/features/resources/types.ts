import type { api } from '@convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

export type Resource = FunctionReturnType<
  typeof api.resources.list
>['page'][number]
