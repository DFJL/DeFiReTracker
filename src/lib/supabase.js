import { createClient } from '@supabase/supabase-js'

// The DB migration folded this project's tables into FireOracle's Supabase
// project under a `crypto` schema instead of `public` — every unqualified
// .from() call here needs to resolve against that schema, not the default.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { db: { schema: 'crypto' } }
)
