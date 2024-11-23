import React, { useState } from "react";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import {
  TrashIcon,
  StarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DocumentIcon,
  ArchiveBoxIcon,
  FolderIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";

// Custom components for ReactMarkdown
const MarkdownComponents = {
  // Handle code blocks and inline code
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : 'text';
    
    return !inline ? (
      <div className="relative group">
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium text-gray-400 bg-gray-800/70 px-2 py-1 rounded-md">
            {language}
          </span>
        </div>
        <SyntaxHighlighter
          style={tomorrow}
          language={language}
          PreTag="div"
          className="!my-4 !bg-gray-50/80 !rounded-xl !border !border-gray-100/80 !shadow-sm !backdrop-blur-sm"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    ) : (
      <code className="font-mono text-sm bg-gray-100/80 px-1.5 py-0.5 rounded-md" {...props}>
        {children}
      </code>
    );
  },
  
  // Enhanced headings with gradient underline
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gradient-to-r from-gray-200 to-transparent">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-medium text-gray-800 mb-3 mt-6">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-medium text-gray-700 mb-2 mt-4">
      {children}
    </h3>
  ),
  
  // Enhanced paragraphs
  p: ({ children }) => (
    <p className="text-gray-600 leading-relaxed mb-4">
      {children}
    </p>
  ),
  
  // Enhanced lists
  ul: ({ children }) => (
    <ul className="space-y-2 mb-4 ml-4">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-2 mb-4 ml-4 list-decimal">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 group">
      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300 group-hover:bg-purple-400 transition-colors duration-200" />
      <span className="flex-1 -mt-0.5">{children}</span>
    </li>
  ),
  
  // Enhanced blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-purple-200 pl-4 my-4 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  
  // Enhanced tables
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full divide-y divide-gray-200 border border-gray-100 rounded-lg">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-50">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-sm text-gray-600 border-t border-gray-100">
      {children}
    </td>
  ),
  
  // Enhanced links
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-purple-600 hover:text-purple-700 underline decoration-purple-200 hover:decoration-purple-400 transition-colors duration-200"
    >
      {children}
    </a>
  ),
};

const parseRawContent = (content) => {
  const timestampMatch = content.match(/\[(.*?)\]/);
  const mainContent = content
    .replace(/\[.*?\]/, "") // Remove timestamp
    .split("Context:"); // Split main content and context

  return {
    timestamp: timestampMatch ? timestampMatch[1] : "",
    content: mainContent[0].trim(),
    context: mainContent[1]?.trim() || "",
  };
};

const parseCompressedContent = (content) => {
  const timestampMatch = content.match(/\[(.*?)\]/);
  const sourceMemoriesSection = content.match(/Source Memories:\s*(.*?)$/s)?.[1]?.trim() || '';
  const sourceMemoriesCount = sourceMemoriesSection
    .split('\n')
    .filter(line => line.trim())
    .length;

  // Helper function to clean and format content sections
  const formatSection = (text) => {
    if (!text) return '';
    
    // Preserve code blocks by replacing them temporarily
    const codeBlocks = [];
    let formattedText = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      codeBlocks.push({ lang, code: code.trim() });
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // Clean up the text
    formattedText = formattedText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');

    // Restore code blocks with proper markdown formatting
    formattedText = formattedText.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
      const block = codeBlocks[parseInt(index)];
      return `\`\`\`${block.lang}\n${block.code}\n\`\`\``;
    });

    return formattedText;
  };

  const sections = {
    summary: formatSection(content.match(/SUMMARY:\s*(.*?)(?=\s*KEY POINTS:)/s)?.[1]),
    keyPoints: formatSection(content.match(/KEY POINTS:\s*(.*?)(?=\s*RELATIONSHIPS:)/s)?.[1]),
    relationships: formatSection(content.match(/RELATIONSHIPS:\s*(.*?)(?=\s*DETAILS:)/s)?.[1]),
    details: formatSection(content.match(/DETAILS:\s*(.*?)(?=\s*Source Memories:)/s)?.[1]),
    sourceMemories: formatSection(sourceMemoriesSection),
  };

  return {
    timestamp: timestampMatch ? timestampMatch[1] : '',
    memoryCount: sourceMemoriesCount,
    ...sections,
  };
};

function Memory({ memory, onDelete, onExport }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  const TypeIcon = typeIcons[memory.type] || DocumentIcon;

  const renderContent = (content) => {
    if (!content) return null;
    
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MarkdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  const renderSection = (title, content) => {
    if (!content) return null;

    return (
      <div className="rounded-xl bg-gradient-to-b from-white to-gray-50/50 border border-gray-100/80 shadow-sm backdrop-blur-sm p-4 space-y-3">
        {title && (
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-medium text-gray-900">{title}</h3>
            <div className="h-px flex-1 bg-gradient-to-r from-gray-200/80 to-transparent" />
          </div>
        )}
        {renderContent(content)}
      </div>
    );
  };

  const parsedContent =
    memory.type === "compressed"
      ? parseCompressedContent(memory.content)
      : parseRawContent(memory.content);

  return (
    <div
      className={`p-5 rounded-2xl border bg-gradient-to-b ${
        typeColors[memory.type] ||
        "from-gray-500/10 to-gray-500/5 border-gray-100"
      } transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-black/5 transform hover:-translate-y-0.5`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
          <span className="text-xs font-medium text-gray-500 capitalize px-3 py-1 bg-white/50 backdrop-blur-sm rounded-full">
            {memory.type}
          </span>
          {memory.type === "compressed" && parsedContent?.memoryCount && (
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
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-500 transition-colors duration-300"
              aria-label="Delete memory"
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {memory.type === "compressed" ? (
          <>
            {renderSection("Summary", parsedContent.summary)}
            {renderSection("Key Points", parsedContent.keyPoints)}
            {renderSection("Relationships", parsedContent.relationships)}
            {renderSection("Details", parsedContent.details)}
            {renderSection("Source Memories", parsedContent.sourceMemories)}
          </>
        ) : (
          <>
            {renderSection(null, parsedContent.content)}
            {parsedContent.context &&
              renderSection("Context", parsedContent.context)}
          </>
        )}
      </div>
    </div>
  );
}

export default Memory;
