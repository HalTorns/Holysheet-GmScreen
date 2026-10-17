import { useEffect, useState } from 'react'

export function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value.trim()), 300)
    return () => clearTimeout(timer)
  }, [value])
  return search
}
