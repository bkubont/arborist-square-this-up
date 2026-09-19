import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api/client';
export default function Register() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true); setError('');
    try { await api.auth.register({ email, password, inviteToken }); window.location.assign('/'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <AuthLayout icon={UserPlus} title={inviteToken ? 'Create your account' : 'Invitation required'}
    subtitle={inviteToken ? 'Your clients and jobs will be private to your account.' : 'Contact the app owner to request an invitation.'}
    footer={<Link className="text-primary hover:underline" to="/login">Back to log in</Link>}>
    {inviteToken && <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div><Label htmlFor="password">Password (at least 12 characters)</Label><Input id="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      <Button className="w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
    </form>}
  </AuthLayout>;
}
