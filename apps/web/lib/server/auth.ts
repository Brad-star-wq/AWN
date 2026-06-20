import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Gate for every protected read, Server Action, and page. Returns the
 * authenticated owner or redirects to `/login`. Single owner for now; staff
 * roles are a later add (open question in BUILD_PLAN.md).
 */
export async function requireOwner(): Promise<User> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}
