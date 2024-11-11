import React from 'react';
import { TrashIcon, StarIcon } from '@heroicons/react/24/outline';

export default function Memory({ memory, onDelete }) {
    const typeColors = {
        raw: 'bg-blue-100',
        compressed: 'bg-yellow-100',
        root: 'bg-green-100'
    };

    function formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    return (
        <div className={`p-3 rounded-md relative group ${typeColors[memory.type] || 'bg-gray-50'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-gray-500 capitalize">
                    {memory.type}
                </span>
                <div className="flex items-center">
                    <div className="flex items-center mr-2">
                        <StarIcon className="h-4 w-4 text-yellow-400" />
                        <span className="text-xs ml-1">{memory.importance}</span>
                    </div>
                    <button
                        onClick={() => onDelete(memory.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
            
            <div className="text-sm text-gray-900">
                {memory.content}
            </div>
            
            <div className="mt-2 text-xs text-gray-500">
                {formatDate(memory.timestamp)}
                {memory.sourceCount && (
                    <span className="ml-2">
                        (Compressed from {memory.sourceCount} memories)
                    </span>
                )}
            </div>
        </div>
    );
}