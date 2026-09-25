import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from './Button';

const COUNTDOWN_SECONDS = 5;

/**
 * Global session notice: token expiry ("Your session has expired, please
 * login") or explicit logout. Auto-redirects to /login after 5 seconds.
 * Rendered at App level so it survives route changes and logout.
 */
const SessionModal: React.FC = () => {
  const { sessionNotice, dismissSessionNotice } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!sessionNotice) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      return;
    }
    setSecondsLeft(COUNTDOWN_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          dismissSessionNotice();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionNotice, dismissSessionNotice]);

  if (!sessionNotice) return null;

  const expired = sessionNotice.kind === 'expired';
  const updated = sessionNotice.kind === 'access-updated';
  const title = expired ? 'Session expired' : updated ? 'Access updated' : 'Logged out';
  const message = expired
    ? 'Your session has expired, please login again.'
    : updated
    ? 'Your access was updated by your administrator. Please login again to continue.'
    : sessionNotice.reason === 'inactivity'
    ? 'You were logged out due to inactivity.'
    : 'You have been logged out.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 text-center">
        <div
          className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center text-xl font-bold border ${
            expired
              ? 'bg-amber-50 border-amber-200 text-amber-600'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}
        >
          {expired ? '◷' : '→'}
        </div>
        <h2 className="text-base font-extrabold text-slate-900 mt-3">{title}</h2>
        <p className="text-xs text-slate-500 mt-1">{message}</p>
        <p className="text-[11px] text-slate-400 mt-2">
          Redirecting to login in <span className="font-bold text-slate-700">{secondsLeft}s</span>…
        </p>
        <div className="w-full h-1 bg-slate-100 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / COUNTDOWN_SECONDS) * 100}%` }}
          />
        </div>
        <Button onClick={dismissSessionNotice} size="sm" className="w-full mt-4">
          {expired ? 'Login now' : 'Continue to login'}
        </Button>
      </div>
    </div>
  );
};

export default SessionModal;
