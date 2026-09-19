import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api/client';
import { DEFAULT_SALES_TAX_RATE } from '@/lib/salesTax';

export default function Register() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [salesTaxRate, setSalesTaxRate] = useState(String(DEFAULT_SALES_TAX_RATE));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    const tax = Number(salesTaxRate);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) return setError('Sales tax must be between 0 and 100');
    setBusy(true); setError('');
    try {
      await api.auth.register({ email, password, inviteToken, default_tax_rate: tax });
      window.location.assign('/');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <AuthLayout icon={UserPlus} title={inviteToken ? 'Create your account' : 'Invitation required'}
    subtitle={inviteToken ? 'Your clients and jobs will be private to your account.' : 'Contact the app owner to request an invitation.'}
    footer={<Link className="text-primary hover:underline" to="/login">Back to log in</Link>}>
    {inviteToken && <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div><Label htmlFor="password">Password (at least 12 characters)</Label><Input id="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      <div>
        <Label htmlFor="sales-tax">Sales tax rate (%)</Label>
        <Input
          id="sales-tax"
          type="number"
          min={0}
          max={100}
          step="0.01"
          required
          value={salesTaxRate}
          onChange={e => setSalesTaxRate(e.target.value)}
          placeholder={String(DEFAULT_SALES_TAX_RATE)}
        />
        <p className="text-xs text-slate-500 mt-1">Default {DEFAULT_SALES_TAX_RATE}%. Used on estimates, invoices, and other forms. You can change this later under Company settings.</p>
      </div>
      <Button className="w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
    </form>}
  </AuthLayout>;
}
