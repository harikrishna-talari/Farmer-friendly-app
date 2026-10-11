import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, ShieldCheck, Sprout } from 'lucide-react';

export default function LoginPage({ onAuthenticate }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onAuthenticate({ mode, name: name.trim(), email: email.trim(), password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Farmer Friendly">
        <div className="login-story__brand">
          <span className="login-brand-mark"><Sprout size={25} /></span>
          <span>Farmer friendly</span>
        </div>

        <div className="login-story__content">
          <span className="login-eyebrow"><Leaf size={14} /> GROW SMARTER, TOGETHER</span>
          <h1>Your hard work deserves a <span>better market.</span></h1>
          <p>One simple place to connect with buyers, follow fair prices, and make confident decisions for your farm.</p>

          <div className="login-benefits">
            <div><span className="login-benefit-icon"><Sprout size={17} /></span><span>Reach buyers beyond your local market</span></div>
            <div><span className="login-benefit-icon"><ShieldCheck size={17} /></span><span>Keep your harvest and orders organized</span></div>
          </div>
        </div>

        <p className="login-story__footer">BUILT FOR THE PEOPLE WHO FEED US</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-mobile-brand">
            <span className="login-brand-mark"><Sprout size={23} /></span>
            <span>Farmer friendly</span>
          </div>
          <div className="login-heading">
            <span className="login-heading-icon"><LockKeyhole size={19} /></span>
            <p className="login-eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE COMMUNITY'}</p>
            <h2>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Enter your details to continue to your farming dashboard.' : 'Set up an account to connect with your marketplace.'}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <>
                <label htmlFor="login-name">Your name</label>
                <div className="login-input-wrap">
                  <Sprout size={17} aria-hidden="true" />
                  <input
                    id="login-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
              </>
            )}
            <label htmlFor="login-email">Email address</label>
            <div className="login-input-wrap">
              <Mail size={17} aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="login-password-label">
              <label htmlFor="login-password">Password</label>
            </div>
            <div className="login-input-wrap">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={128}
                required
              />
              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17} />
            </button>
          </form>

          <p className="login-switch">
            {mode === 'login' ? 'New to Farmer Friendly?' : 'Already have an account?'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="login-privacy"><ShieldCheck size={13} /> Your farm. Your choices. Your future.</p>
        </div>
      </section>
    </main>
  );
}
