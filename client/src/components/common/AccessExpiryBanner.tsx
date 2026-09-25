import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ACCESS_WARNING_DAYS } from '../../utils/accessPolicy';

const LAST_SHOWN_KEY = 'access-expiry-banner-at';
const TWICE_DAILY_MS = 12 * 60 * 60 * 1000;

/**
 * Security reminder in the last days of the 90-day access window:
 * "please log out and log in again…". Shown at most twice a day.
 */
const AccessExpiryBanner: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);

  const daysLeft = typeof user?.accessDaysLeft === 'number' ? user.accessDaysLeft : null;

  useEffect(() => {
    if (!isAuthenticated || daysLeft === null || daysLeft <= 0 || daysLeft > ACCESS_WARNING_DAYS) {
      setVisible(false);
      return;
    }
    const last = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
    if (Date.now() - last < TWICE_DAILY_MS) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [isAuthenticated, daysLeft, user?.id]);

  if (!visible || daysLeft === null) return null;

  const dismiss = () => {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <div className="w-full max-w-7xl 2xl:max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
      <span className="text-amber-600 text-lg leading-none mt-0.5">◷</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-900">
          For your security, your access ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}.
        </p>
        <p className="text-[11px] text-amber-800 mt-0.5">
          Please log out and log in again soon to keep enjoying smooth, uninterrupted services.
          If your work needs more time, ask your administrator to extend your access.
        </p>
      </div>
      <button onClick={dismiss} className="text-[11px] font-bold text-amber-700 hover:text-amber-900 shrink-0 px-2 py-1">
        Remind me later
      </button>
      </div>
    </div>
  );
};

export default AccessExpiryBanner;
