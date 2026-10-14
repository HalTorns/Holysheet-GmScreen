import { convexQuery } from '@convex-dev/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'

// The router supplies Convex's queryFn/hashFn. Keep the return type while
// omitting the bridge's optional queryFn under exactOptionalPropertyTypes.
export function ensureConvexQuery<
  Query extends FunctionReference<'query', 'public'>,
>(client: QueryClient, query: Query, args: FunctionArgs<Query>) {
  return client.query<FunctionReturnType<Query>>({
    queryKey: convexQuery(query, args).queryKey,
    staleTime: 'static',
  })
}
