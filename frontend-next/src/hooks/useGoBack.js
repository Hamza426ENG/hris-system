import { useRouter } from 'next/router';
import { useCallback } from 'react';

/**
 * Returns a goBack() function that navigates to the previous page in the
 * browser's session history (router.back()), or falls back to `fallback`
 * when the user arrived directly (e.g. opened the URL in a new tab).
 *
 * Usage:
 *   const goBack = useGoBack('/employees');
 *   <button onClick={goBack}>Back</button>
 */
export default function useGoBack(fallback = '/') {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);
}
