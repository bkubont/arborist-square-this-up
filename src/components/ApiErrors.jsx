import { useEffect, useState } from 'react';
export default function ApiErrors() {
  const [error, setError] = useState('');
  useEffect(() => {
    const onError = event => {
      if (event.detail.status === 401 && !['/login','/register','/forgot-password','/reset-password'].includes(window.location.pathname) && !window.location.pathname.startsWith('/sign/')) {
        window.location.assign('/login'); return;
      }
      if (event.detail.status !== 401) setError(event.detail.message);
    };
    window.addEventListener('api-error', onError);
    return () => window.removeEventListener('api-error', onError);
  }, []);
  return error ? <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-red-200 bg-white p-4 shadow-lg"><p className="text-sm text-red-700">{error}</p><button className="mt-2 text-sm underline" onClick={() => setError('')}>Dismiss</button></div> : null;
}
