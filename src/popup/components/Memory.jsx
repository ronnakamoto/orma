import React, { useState } from "react";
import { TrashIcon, StarIcon, ChevronRightIcon, ChevronDownIcon, DocumentIcon, ArchiveBoxIcon, FolderIcon } from "@heroicons/react/24/outline";

export default function Memory({ memory, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const typeColors = {
    raw: "from-blue-500/10 to-blue-500/5 border-blue-100",
    compressed: "from-amber-500/10 to-amber-500/5 border-amber-100",
    root: "from-emerald-500/10 to-emerald-500/5 border-emerald-100",
  };

  const typeIcons = {
    raw: DocumentIcon,
    compressed: ArchiveBoxIcon,
    root: FolderIcon,
  };

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(new Date(timestamp));
  }

  const TypeIcon = typeIcons[memory.type] || DocumentIcon;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const parseRawContent = (content) => {
    const timestampMatch = content.match(/\[(.*?)\]/);
    const mainContent = content
      .replace(/\[.*?\]/, '')  // Remove timestamp
      .split('Context:');      // Split main content and context
    
    return {
      timestamp: timestampMatch ? timestampMatch[1] : '',
      content: mainContent[0].trim(),
      context: mainContent[1]?.trim() || ''
    };
  };

  // Parse the compressed memory content
  const parseCompressedContent = (content) => {
    // Parse timestamp and memory count from the header
    const timestampMatch = content.match(/\[(.*?)\]/);
    const memoryCountMatch = content.match(/\((\d+) memories\)/);
    
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    const memoryCount = memoryCountMatch ? memoryCountMatch[1] : '0';

    // Extract sections using more precise regex patterns
    const sections = {
      summary: content.match(/SUMMARY:\s*(.*?)(?=\s*KEY POINTS:)/s)?.[1]?.trim(),
      keyPoints: content.match(/KEY POINTS:\s*(.*?)(?=\s*RELATIONSHIPS:)/s)?.[1]?.trim(),
      relationships: content.match(/RELATIONSHIPS:\s*(.*?)(?=\s*DETAILS:)/s)?.[1]?.trim(),
      details: content.match(/DETAILS:\s*(.*?)(?=\s*Source Memories:)/s)?.[1]?.trim(),
      sourceMemories: content.match(/Source Memories:\s*(.*?)$/s)?.[1]?.trim()
    };

    return {
      timestamp,
      memoryCount,
      ...sections
    };
  };

  const renderSection = (title, content, type = 'text') => {
    if (!content) return null;

    const renderContent = () => {
      switch (type) {
        case 'list':
          return (
            <ul className="space-y-2">
              {content.split('\n')
                .map(item => item.trim())
                .filter(Boolean)
                .map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400"/>
                    <span>{item.replace(/^-\s*/, '')}</span>
                  </li>
              ))}
            </ul>
          );
        case 'sources':
          return (
            <ol className="list-decimal list-inside space-y-2">
              {content.split('\n')
                .map(item => item.trim())
                .filter(Boolean)
                .map((item, idx) => (
                  <li key={idx} className="pl-2">
                    {item.replace(/^\d+\.\s*/, '')}
                  </li>
              ))}
            </ol>
          );
        case 'context':
          return (
            <div className="bg-gray-50 px-3 py-2 rounded-md text-sm text-gray-600 italic">
              {content}
            </div>
          );
        default:
          return <p className="leading-relaxed">{content}</p>;
      }
    };

    return (
      <div className="space-y-2">
        {title && <h3 className="font-medium text-gray-900">{title}</h3>}
        <div className="text-sm text-gray-600">
          {renderContent()}
        </div>
      </div>
    );
  };

  const parsedContent = memory.type === 'compressed' 
    ? parseCompressedContent(memory.content)
    : parseRawContent(memory.content);

  return (
    <div
      className={`p-5 rounded-2xl border bg-gradient-to-b ${
        typeColors[memory.type] || "from-gray-500/10 to-gray-500/5 border-gray-100"
      } transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-black/5 transform hover:-translate-y-0.5`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
          <span className="text-xs font-medium text-gray-500 capitalize px-3 py-1 bg-white/50 backdrop-blur-sm rounded-full">
            {memory.type}
          </span>
          {memory.type === 'compressed' && parsedContent?.memoryCount && (
            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              {parsedContent.memoryCount} memories
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/50 backdrop-blur-sm rounded-full px-2 py-1">
            <StarIcon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            <span className="text-xs font-medium ml-1 text-gray-600">
              {memory.importance}
            </span>
          </div>
          <button
            onClick={() => onDelete(memory.id)}
            className="text-gray-400 hover:text-red-500 transition-colors duration-300"
            aria-label="Delete memory"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {memory.type === 'compressed' ? (
          <>
            {renderSection("Summary", parsedContent.summary)}
            {isExpanded && (
              <div className="space-y-4">
                {renderSection("Key Points", parsedContent.keyPoints, 'list')}
                {renderSection("Relationships", parsedContent.relationships, 'list')}
                {renderSection("Details", parsedContent.details)}
                {renderSection("Source Memories", parsedContent.sourceMemories, 'sources')}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {renderSection(null, parsedContent.content)}
            {parsedContent.context && renderSection(null, parsedContent.context, 'context')}
          </div>
        )}

        {memory.type === 'compressed' && (
          <button 
            onClick={toggleExpand}
            className="mt-2 text-sm text-purple-600 hover:text-purple-700 font-medium inline-flex items-center gap-0.5 transition-colors duration-200"
          >
            {isExpanded ? (
              <>
                Show less
                <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />
              </>
            ) : (
              <>
                Read more
                <ChevronRightIcon className="h-3 w-3" aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 mt-4">
        {parsedContent.timestamp ? (
          <time dateTime={new Date(parsedContent.timestamp).toISOString()}>
            {formatDate(new Date(parsedContent.timestamp))}
          </time>
        ) : (
          <time dateTime={new Date(memory.timestamp).toISOString()}>
            {formatDate(memory.timestamp)}
          </time>
        )}
        {memory.sourceCount && memory.type !== 'compressed' && (
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-gray-300" aria-hidden="true" />
            <span className="font-medium">
              {memory.sourceCount} sources
            </span>
          </div>
        )}
      </div>
    </div>
  );
}