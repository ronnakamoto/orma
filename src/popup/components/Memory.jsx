import React from "react";
import { TrashIcon, StarIcon } from "@heroicons/react/24/outline";

export default function Memory({ memory, onDelete }) {
  const typeColors = {
    raw: "bg-blue-50 border-blue-200",
    compressed: "bg-yellow-50 border-yellow-200",
    root: "bg-green-50 border-green-200",
  };

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  return (
    <div
      className={`p-4 rounded-lg border ${
        typeColors[memory.type] || "bg-gray-50 border-gray-200"
      } transition-all duration-300 ease-in-out hover:shadow-md transform hover:-translate-y-1`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-medium text-gray-500 capitalize px-2 py-1 bg-white rounded-full transition-colors duration-300 ease-in-out hover:bg-gray-100">
          {memory.type}
        </span>
        <div className="flex items-center space-x-2">
          <div className="flex items-center">
            <StarIcon className="h-4 w-4 text-yellow-400" />
            <span className="text-xs ml-1 text-gray-600">
              {memory.importance}
            </span>
          </div>
          <button
            onClick={() => onDelete(memory.id)}
            className="text-gray-400 hover:text-red-600 transition-colors duration-300 ease-in-out transform hover:scale-110"
            aria-label="Delete memory"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-800 mt-2">{memory.content}</div>

      <div className="mt-3 text-xs text-gray-500 flex items-center justify-between">
        <span>{formatDate(memory.timestamp)}</span>
        {memory.sourceCount && (
          <span className="bg-gray-100 px-2 py-1 rounded-full transition-colors duration-300 ease-in-out hover:bg-gray-200">
            {memory.sourceCount} sources
          </span>
        )}
      </div>
    </div>
  );
}
