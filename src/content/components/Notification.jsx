import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function Notification({ message, duration = 3000, type = 'info' }) {
  const [show, setShow] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300); // Start exit animation 300ms before hiding

    const hideTimer = setTimeout(() => {
      setShow(false);
    }, duration);

    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, [duration]);

  if (!show) return null;

  const bgColors = {
    info: 'bg-gradient-to-r from-blue-600 to-indigo-600',
    success: 'bg-gradient-to-r from-green-600 to-emerald-600',
    warning: 'bg-gradient-to-r from-yellow-500 to-amber-500',
    error: 'bg-gradient-to-r from-red-600 to-rose-600',
  };

  return (
    <div
      className={`fixed bottom-4 right-4 ${bgColors[type]} text-white px-4 py-3 rounded-lg shadow-lg font-space-grotesk max-w-md transition-all duration-300 ease-in-out ${
        isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium mr-8">{message}</p>
        <button
          onClick={() => setIsExiting(true)}
          className="text-white hover:text-gray-200 transition-colors duration-200"
          aria-label="Close notification"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 h-1 bg-white bg-opacity-30 rounded-full transition-all duration-300 ease-in-out" style={{ width: `${(duration - 300) / duration * 100}%` }} />
    </div>
  );
}