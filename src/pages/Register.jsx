import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fetchApi } from '@/api/client';
import { DEFAULT_SALES_TAX_RATE } from '@/lib/salesTax';
import { assignAppPath } from '@/lib/desktopSession';
import { ROLE_LABELS } from '@/lib/permissions';

export default function Register() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [salesTaxRate, setSalesTaxRate] = useState(String(DEFAULT_SALES_TAX_RATE));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteKind, setInviteKind] = useState(params.get('kind') === 'member' ? 'member' : null);
  const [memberRoleLabel, setMemberRoleLabel] = useState('');

  useEffect(() => {
    if (!inviteToken || !email) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchApi(
          `/auth/invite-info?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setInviteKind(data.kind || 'company');
        if (data.kind === 'member') {
          setMemberRoleLabel(data.role_label || ROLE_LABELS[data.role] || data.role || 'Member');
        }
      } catch {
        // Keep default form; server validates on submit.
      }
    })();
    return () => { cancelled = true; };
  }, [inviteToken, email]);

  const isMemberInvite = inviteKind === 'member';

  const submit = async event => {
    event.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    if (!isMemberInvite) {
      const tax = Number(salesTaxRate);
      if (!Number.isFinite(tax) || tax < 0 || tax > 100) return setError('Sales tax must be between 0 and 100');
    }
    setBusy(true); setError('');
    try {
      const payload = { email, password, inviteToken };
      if (!isMemberInvite) payload.default_tax_rate = Number(salesTaxRate);
      await api.auth.register(payload);
      assignAppPath('/');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const title = !inviteToken
    ? 'Invitation required'
    : isMemberInvite
      ? 'Join your company'
      : 'Create your account';
  const subtitle = !inviteToken
    ? 'Contact the app owner to request an invitation.'
    : isMemberInvite
      ? `You are joining as ${memberRoleLabel || 'a team member'}. Company data is shared according to your role.`
      : 'Your clients and jobs will be private to your company account.';

  return <AuthLayout icon={UserPlus} title={title} subtitle={subtitle}
    footer={<Link className="text-primary hover:underline" to="/login">Back to log in</Link>}>
    {inviteToken && <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div><Label htmlFor="password">Password (at least 12 characters)</Label><Input id="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      {!isMemberInvite ? (
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
      ) : null}
      <Button className="w-full" disabled={busy}>
        {busy ? (isMemberInvite ? 'Joining…' : 'Creating account…') : (isMemberInvite ? 'Join company' : 'Create account')}
      </Button>
    </form>}
  </AuthLayout>;
}
