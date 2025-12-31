import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth errors from provider
  if (error) {
    console.error('[Auth] OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      `${origin}?auth_error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    console.error('[Auth] No authorization code found in callback');
    return NextResponse.redirect(`${origin}?auth_error=No+authorization+code`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Auth] Supabase environment variables not configured');
    return NextResponse.redirect(`${origin}?auth_error=Server+configuration+error`);
  }

  const cookieStore = cookies();

  // Create a Supabase server client with cookie handling
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch (error) {
          // This can happen if headers have already been sent
          console.error('[Auth] Error setting cookie:', name, error);
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.delete({ name, ...options });
        } catch (error) {
          console.error('[Auth] Error removing cookie:', name, error);
        }
      },
    },
  });

  try {
    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[Auth] PKCE exchange error:', exchangeError);
      return NextResponse.redirect(
        `${origin}?auth_error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    // Success! Redirect to home page
    return NextResponse.redirect(origin);
  } catch (error) {
    console.error('[Auth] Unexpected error during auth callback:', error);
    return NextResponse.redirect(`${origin}?auth_error=Unexpected+error`);
  }
}

