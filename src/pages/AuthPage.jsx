import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { auth as firebaseAuth, db } from '../firebase/config';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import './AuthPage.css';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signUp, signIn, signInWithGoogle, currentUser } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const [activeTab, setActiveTab] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  // Toggle Language
  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'my' : 'en');
  };

  // Sign In submit
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const userCredential = await signIn(email, password);
      const user = userCredential.user;
      
      // Check if email is verified
      if (!user.emailVerified) {
        setVerificationPending(true);
        setError('Please verify your email address before logging in.');
        setLoading(false);
        return;
      }
      
      navigate('/home');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to sign in.');
      setLoading(false);
    }
  };

  // Sign Up submit
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (!username.trim()) {
      setError('Username is required.');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password, username);
      setVerificationPending(true);
      setMessage(t('otpSent'));
    } catch (err) {
      console.error(err);
      if (err.message === 'USERNAME_TAKEN') {
        setError(t('usernameTaken'));
      } else {
        setError(err.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Google Sign In
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/home');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  // Check email verification status manually
  const checkVerificationStatus = async () => {
    setError('');
    if (firebaseAuth.currentUser) {
      await firebaseAuth.currentUser.reload();
      if (firebaseAuth.currentUser.emailVerified) {
        navigate('/home');
      } else {
        setError('Email is still unverified. Please check your inbox and spam folder.');
      }
    }
  };

  // Send password reset email
  const handleResetPassword = async () => {
    if (!email) {
      setError(language === 'en' ? 'Please enter your email address first.' : 'Sila masukkan alamat e-mel anda terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setMessage(language === 'en' ? 'Password reset link sent! Please check your email.' : 'Pautan tetapkan semula kata laluan telah dihantar! Sila semak e-mel anda.');
    } catch (err) {
      console.error(err);
      setError(err.message || (language === 'en' ? 'Failed to send password reset email.' : 'Gagal menghantar e-mel tetapkan semula kata laluan.'));
    } finally {
      setLoading(false);
    }
  };

  // Retrieve username by email
  const handleForgotUsername = async () => {
    if (!email) {
      setError(language === 'en' ? 'Please enter your email address first.' : 'Sila masukkan alamat e-mel anda terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim()));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError(language === 'en' ? 'No account found with this email address.' : 'Tiada akaun ditemui dengan alamat e-mel ini.');
      } else {
        const userDoc = querySnapshot.docs[0].data();
        setMessage(language === 'en' ? `Your username is: ${userDoc.username}` : `Nama pengguna anda ialah: ${userDoc.username}`);
      }
    } catch (err) {
      console.error(err);
      setError(language === 'en' ? 'Failed to retrieve username. Please try again.' : 'Gagal mendapatkan semula nama pengguna. Sila cuba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // Verification Pending UI view
  if (verificationPending) {
    return (
      <div className="auth-page">
        <div className="lang-pill dark" onClick={toggleLanguage} style={{ position: 'absolute', top: '20px', right: '20px' }}>
          <span className={language === 'my' ? 'active' : ''}>MY</span>
          <span className={language === 'en' ? 'active' : ''}>EN</span>
        </div>
        
        <div className="auth-container verification-container">
          <img src="/Entites/Small Logo (White).png" alt="RONDA" className="auth-logo cyan-filter" />
          <h2>{t('emailVerifyHeading')}</h2>
          <p className="verification-text">{message || 'We sent a verification link to your email. Click it to activate your account.'}</p>
          
          {error && <div className="auth-error">{error}</div>}
          
          <button 
            className="btn-primary auth-submit-btn" 
            onClick={checkVerificationStatus}
          >
            {t('checkVerification')}
          </button>
          
          <button 
            className="auth-back-btn" 
            onClick={() => {
              setVerificationPending(false);
              setError('');
              setMessage('');
            }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page-redesign" style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color-main)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Upper Jungle Hero Banner */}
      <div 
        className="auth-hero-banner" 
        style={{ 
          height: '42vh', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          backgroundImage: `linear-gradient(rgba(55, 32, 24, 0.5), rgba(55, 32, 24, 0.3)), url('https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=600&auto=format&fit=crop')`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative'
        }}
      >
        <div className="lang-pill" onClick={toggleLanguage} style={{ position: 'absolute', top: '20px', right: '20px' }}>
          <span className={language === 'my' ? 'active' : ''}>MY</span>
          <span className={language === 'en' ? 'active' : ''}>EN</span>
        </div>

        <span style={{ fontSize: '13px', color: 'white', fontWeight: '800', letterSpacing: '2px', marginBottom: '4px' }}>WELCOME TO</span>
        <div className="banner-ronda-logo-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
          <img src="/Entites/Main Logo (White).png" alt="RONDA" style={{ height: '65px', objectFit: 'contain' }} />
        </div>
        <span style={{ fontSize: '11px', color: 'white', fontWeight: '900', letterSpacing: '1px' }}>TRAVEL IS A HEALTHY ADDICTION</span>
      </div>

      {/* Curved Bottom White Container */}
      <div 
        className="auth-bottom-card" 
        style={{ 
          flex: '1', 
          backgroundColor: 'var(--bg-color-card)', 
          borderTopLeftRadius: '38px', 
          borderTopRightRadius: '38px', 
          marginTop: '-35px', 
          zIndex: '10', 
          padding: '30px 24px', 
          display: 'flex', 
          flexDirection: 'column', 
          boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
          border: '1px solid var(--border-color)',
          borderBottom: 'none'
        }}
      >
        {/* Toggle Custom Tab Buttons */}
        <div 
          className="auth-redesign-tabs" 
          style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: '15px', 
            marginBottom: '28px' 
          }}
        >
          <button 
            className={`auth-redesign-tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => { setActiveTab('signup'); setError(''); }}
            style={{ 
              padding: '10px 24px', 
              borderRadius: 'var(--radius-full)', 
              border: activeTab === 'signup' ? '1px solid var(--color-primary)' : 'none', 
              backgroundColor: activeTab === 'signup' ? 'white' : 'transparent', 
              color: activeTab === 'signup' ? 'var(--color-brown-dark)' : 'var(--text-color-muted)',
              fontWeight: '800', 
              fontSize: '13px', 
              boxShadow: activeTab === 'signup' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer'
            }}
          >
            SIGN UP
          </button>
          <button 
            className={`auth-redesign-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => { setActiveTab('signin'); setError(''); }}
            style={{ 
              padding: '10px 24px', 
              borderRadius: 'var(--radius-full)', 
              border: activeTab === 'signin' ? '1px solid var(--color-primary)' : 'none', 
              backgroundColor: activeTab === 'signin' ? 'white' : 'transparent', 
              color: activeTab === 'signin' ? 'var(--color-brown-dark)' : 'var(--text-color-muted)',
              fontWeight: '800', 
              fontSize: '13px', 
              boxShadow: activeTab === 'signin' ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer'
            }}
          >
            SIGN IN
          </button>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: '16px' }}>{error}</div>}
        {message && <div className="auth-message" style={{ marginBottom: '16px' }}>{message}</div>}

        {activeTab === 'signin' ? (
          <form className="auth-redesign-form" onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-input-row" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address" 
                required
                style={{ width: '100%', padding: '14px 20px', borderRadius: 'var(--radius-full)', border: 'none', backgroundColor: '#9cd4d2', color: 'var(--color-brown-dark)', fontSize: '13.5px', fontWeight: '600', outline: 'none' }}
              />
              <span style={{ fontSize: '9.5px', color: 'var(--text-color-muted)', alignSelf: 'flex-end', cursor: 'pointer', fontWeight: '700' }} onClick={handleForgotUsername}>Forgot Username?</span>
            </div>

            <div className="form-input-row" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" 
                required
                style={{ width: '100%', padding: '14px 20px', borderRadius: 'var(--radius-full)', border: 'none', backgroundColor: '#9cd4d2', color: 'var(--color-brown-dark)', fontSize: '13.5px', fontWeight: '600', outline: 'none' }}
              />
              <span style={{ fontSize: '9.5px', color: 'var(--text-color-muted)', alignSelf: 'flex-end', cursor: 'pointer', fontWeight: '700' }} onClick={handleResetPassword}>Forgot Password?</span>
            </div>

            <button 
              type="submit" 
              className="btn-primary auth-submit-btn-redesign" 
              disabled={loading}
              style={{ width: '100%', padding: '15px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-brown-dark)', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px' }}
            >
              {loading ? t('loading') : 'Log In'}
            </button>
          </form>
        ) : (
          <form className="auth-redesign-form" onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username" 
              required
              style={{ width: '100%', padding: '14px 20px', borderRadius: 'var(--radius-full)', border: 'none', backgroundColor: '#9cd4d2', color: 'var(--color-brown-dark)', fontSize: '13.5px', fontWeight: '600', outline: 'none' }}
            />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address" 
              required
              style={{ width: '100%', padding: '14px 20px', borderRadius: 'var(--radius-full)', border: 'none', backgroundColor: '#9cd4d2', color: 'var(--color-brown-dark)', fontSize: '13.5px', fontWeight: '600', outline: 'none' }}
            />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" 
              required
              style={{ width: '100%', padding: '14px 20px', borderRadius: 'var(--radius-full)', border: 'none', backgroundColor: '#9cd4d2', color: 'var(--color-brown-dark)', fontSize: '13.5px', fontWeight: '600', outline: 'none' }}
            />

            <button 
              type="submit" 
              className="btn-primary auth-submit-btn-redesign" 
              disabled={loading}
              style={{ width: '100%', padding: '15px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-brown-dark)', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px' }}
            >
              {loading ? t('loading') : 'Sign Up'}
            </button>
          </form>
        )}

        <div className="auth-divider-redesign" style={{ display: 'flex', alignItems: 'center', textAlign: 'center', color: 'var(--text-color-muted)', fontSize: '11px', fontWeight: '700', margin: '20px 0' }}>
          <span style={{ flex: '1', borderBottom: '1px solid var(--border-color)', marginRight: '10px' }}></span>
          <span>OR</span>
          <span style={{ flex: '1', borderBottom: '1px solid var(--border-color)', marginLeft: '10px' }}></span>
        </div>

        <button 
          className="auth-google-btn-redesign" 
          onClick={handleGoogleSignIn} 
          disabled={loading}
          style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-full)', backgroundColor: 'white', border: '1px solid var(--border-color)', color: 'var(--color-brown-dark)', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '18px', height: '18px' }} />
          Log in with Google
        </button>
      </div>
    </div>
  );
}
