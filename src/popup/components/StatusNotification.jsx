import React, { useState, useEffect } from 'react';

const StatusNotification = () => {
  const [status, setStatus] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      try {
        // Get status from background script
        const response = await chrome.runtime.sendMessage({ type: 'GET_OPERATION_STATUS' });
        if (response && response.status) {
          setStatus(response.status);
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    };

    // Initial check
    checkStatus();

    // Poll every second
    intervalId = setInterval(checkStatus, 1000);

    // Cleanup
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 animate-slide-in">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {status?.type === 'loading' && (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent" />
            )}
            {status?.type === 'success' && (
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status?.type === 'error' && (
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          {/* Status Message */}
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{status?.message}</p>
            {status?.progress !== undefined && (
              <div className="mt-2">
                <div className="h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-2 bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{status.progress}% complete</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusNotification;
