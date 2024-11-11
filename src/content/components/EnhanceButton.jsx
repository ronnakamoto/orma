import React, { useState } from 'react';

export default function EnhanceButton({ textArea }) {
  const [loading, setLoading] = useState(false);

  async function handleEnhance() {
    setLoading(true);
    const originalPrompt = textArea.value;
    const enhancedPrompt = await ai.enhancePrompt(
      originalPrompt,
      window.ormaCurrentProject
    );
    textArea.value = enhancedPrompt;
    setLoading(false);
  }

  return (
    <button
      onClick={handleEnhance}
      disabled={loading}
      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 mb-2"
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Enhancing...
        </>
      ) : (
        'Enhance with Orma'
      )}
    </button>
  );
}