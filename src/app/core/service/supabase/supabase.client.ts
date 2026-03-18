import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

/**
 * Singleton Supabase client, provided at root level via an InjectionToken.
 * Inject with: `inject(SUPABASE)`
 */
export const SUPABASE = new InjectionToken<SupabaseClient>('SupabaseClient', {
  providedIn: 'root',
  factory: () => createClient(environment.supabaseUrl, environment.supabaseKey),
});
