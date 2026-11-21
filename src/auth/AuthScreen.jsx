import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import './auth.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function AuthScreen({ onAuthenticated, setupError = '', initialError = '' }) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError || '');
  const [messageType, setMessageType] = useState(initialError ? 'error' : '');

  useEffect(() => {
    if (initialError) {
      setMessage(initialError);
      setMessageType('error');
    }
  }, [initialError]);

  async function signIn(event) {
    event.preventDefault();
    if (!/^\+?[\d\s()-]{8,24}$/.test(mobileNumber.trim())) {
      setMessage('Enter a valid registered mobile number.');
      setMessageType('error');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: mobileNumber.trim(), password }),
      });
      const responseText = await response.text();
      let result = {};
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {};
      }
      if (!response.ok) throw new Error(result.error || 'The sign-in service is unavailable. Check that the API server is running and Google Drive is configured.');
      if (!result.token || !result.user) throw new Error('The sign-in service returned an empty response. Check the API server startup output.');
      onAuthenticated({ access_token: result.token, user: result.user });
    } catch (error) {
      setMessage(error instanceof TypeError && /fetch/i.test(error.message)
        ? 'Cannot reach the sign-in service. Check that the API server is running and Google Drive is configured.'
        : error.message || 'Mobile number or password is incorrect.');
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-shell">
    <aside className="auth-visual">
      <a className="auth-brand" href="#login" onClick={(event) => event.preventDefault()}>
        <span className="auth-brand-mark"><i /><i /><i /><i /></span>
        <span><b>SSN Treasury</b><small>COMMUNITY OFFICE</small></span>
      </a>
      <div className="auth-visual-center">
        <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
        <div className="auth-emblem"><ShieldCheck size={33} strokeWidth={1.5} /></div>
        <span className="auth-kicker">SSN COMMUNITY</span>
        <h1>Treasury<br />workspace</h1>
        <div className="auth-rule"><span /><span /><span /><span /></div>
      </div>
      <div className="auth-visual-foot"><span>PRIVATE FINANCIAL ACCESS</span><span>FY {new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}–{String((new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear()) % 100).padStart(2, '0')}</span></div>
    </aside>
    <main className="auth-main">
      <div className="auth-card">
        <div className="auth-card-heading">
          <span className="auth-eyebrow">SECURE ACCOUNT ACCESS</span>
          <h2>Sign in to your account</h2>
          <p>Use your registered mobile number and password.</p>
        </div>

        <form className="auth-form" onSubmit={signIn}>
          <label className="auth-label">Mobile number
            <span className="auth-input-wrap"><Smartphone size={17} /><input type="tel" autoComplete="tel" inputMode="tel" placeholder="Enter your registered mobile number" value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} required /></span>
          </label>
          <button className="auth-forgot-link" type="button" onClick={() => setRecovering(true)}>Forgot password?</button>
          <label className="auth-label">Password
            <span className="auth-input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="auth-reveal" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
          </label>
          {setupError && <p className="auth-config-note"><ShieldCheck size={15} />{setupError}</p>}
          <AuthMessage message={message} type={messageType} />
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button>
        </form>
        <div className="auth-card-foot"><ShieldCheck size={14} /> Your sign-in is protected by secure authentication.</div>
      </div>
      {recovering && <div className="auth-recovery-backdrop"><section className="auth-recovery" role="dialog" aria-modal="true" aria-label="Password recovery"><button type="button" className="auth-recovery-close" aria-label="Close password recovery" onClick={() => setRecovering(false)}>×</button><h3>Password recovery</h3><p>Enter your registered mobile number. Password resets are handled by the administrator.</p><label className="auth-label">Mobile number<span className="auth-input-wrap"><Smartphone size={17} /><input type="tel" inputMode="tel" value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} placeholder="Registered mobile number" /></span></label><button type="button" className="auth-submit" onClick={async () => {
          if (!/^\+?[\d\s()-]{8,24}$/.test(mobileNumber.trim())) { setMessage('Enter a valid registered mobile number.'); setMessageType('error'); return; }
          try {
            const response = await fetch(`${API_URL}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobileNumber: mobileNumber.trim() }) });
            const result = await response.json();
            setRecovering(false);
            setMessage(result.message || 'Password recovery requested.');
            setMessageType('success');
          } catch {
            setMessage('Password recovery could not be completed.');
            setMessageType('error');
          }
        }}>Continue</button></section></div>}
      <div className="auth-mobile-brand"><span className="auth-brand-mark"><i /><i /><i /><i /></span><b>SSN Treasury</b></div>
    </main>
  </div>;
}

function AuthMessage({ message, type }) {
  if (!message) return null;
  return <div className={`auth-message ${type === 'success' ? 'success' : 'error'}`} role={type === 'success' ? 'status' : 'alert'}>{type === 'success' && <CheckCircle2 size={16} />}{message}</div>;
}