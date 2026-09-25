import { useEffect, useState } from 'react';
import { appPathname, assignAppPath } from '@/lib/desktopSession';

export default function ApiErrors() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onError = event => {
      const path = appPathname();
      if (event.detail.status === 401 && !['/login','/register','/forgot-password','/reset-password'].includes(path) && !path.startsWith('/sign/')) {
        assignAppPath('/login'); return;
      }
      if (event.detail.status !== 401) setError(event.detail.message);
    };
    window.addEventListener('api-error', onError);
    return () => window.removeEventListener('api-error', onError);
  }, []);
  return error ? <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-red-200 bg-white p-4 shadow-lg"><p className="text-sm text-red-700">{error}</p><button className="mt-2 text-sm underline" onClick={() => setError('')}>Dismiss</button></div> : null;
}
