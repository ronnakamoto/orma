import React, { useState } from "react";
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

function generateMarkdown(memory, parsedContent) {
  const timestamp =
    parsedContent.timestamp || new Date(memory.timestamp).toISOString();
  const lines = [
    `# Compressed Memory - ${new Date(timestamp).toLocaleString()}`,
    `\nImportance: ${memory.importance}`,
    `\nNumber of Source Memories: ${parsedContent.memoryCount}`,
    "\n## Summary",
    parsedContent.summary,
    "\n## Key Points",
  ];

  if (parsedContent.keyPoints) {
    parsedContent.keyPoints
      .split("\n")
      .map((point) => point.trim())
      .filter(Boolean)
      .forEach((point) => {
        lines.push(`- ${point.replace(/^-\s*/, "")}`);
      });
  }

  lines.push("\n## Relationships");
  if (parsedContent.relationships) {
    parsedContent.relationships
      .split("\n")
      .map((rel) => rel.trim())
      .filter(Boolean)
      .forEach((rel) => {
        lines.push(`- ${rel.replace(/^-\s*/, "")}`);
      });
  }

  lines.push("\n## Details", parsedContent.details);

  lines.push("\n## Source Memories");
  if (parsedContent.sourceMemories) {
    parsedContent.sourceMemories
      .split("\n")
      .map((source) => source.trim())
      .filter(Boolean)
      .forEach((source, index) => {
        lines.push(`${index + 1}. ${source.replace(/^\d+\.\s*/, "")}`);
      });
  }

  return lines.filter(Boolean).join("\n");
}

// Helper function to generate HTML content for PDF
function generateHTML(memory, parsedContent) {
  const timestamp =
    parsedContent.timestamp || new Date(memory.timestamp).toISOString();
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Compressed Memory - ${new Date(
          timestamp
        ).toLocaleString()}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            color: #333;
          }
          h1 { color: #2d3748; margin-bottom: 1rem; }
          h2 { color: #4a5568; margin-top: 2rem; }
          .metadata {
            background-color: #f7fafc;
            padding: 1rem;
            border-radius: 0.5rem;
            margin-bottom: 2rem;
          }
          ul, ol { margin-left: 1rem; }
          li { margin-bottom: 0.5rem; }
          .source-memories {
            background-color: #fff8e1;
            padding: 1rem;
            border-radius: 0.5rem;
          }
        </style>
      </head>
      <body>
        <h1>Compressed Memory - ${new Date(timestamp).toLocaleString()}</h1>
        <div class="metadata">
          <p><strong>Importance:</strong> ${memory.importance}</p>
          <p><strong>Number of Source Memories:</strong> ${
            parsedContent.memoryCount
          }</p>
        </div>
        
        <h2>Summary</h2>
        <p>${parsedContent.summary || "No summary available"}</p>
        
        <h2>Key Points</h2>
        <ul>
          ${
            parsedContent.keyPoints
              ?.split("\n")
              .map((point) => point.trim())
              .filter(Boolean)
              .map((point) => `<li>${point.replace(/^-\s*/, "")}</li>`)
              .join("\n") || "No key points available"
          }
        </ul>
        
        <h2>Relationships</h2>
        <ul>
          ${
            parsedContent.relationships
              ?.split("\n")
              .map((rel) => rel.trim())
              .filter(Boolean)
              .map((rel) => `<li>${rel.replace(/^-\s*/, "")}</li>`)
              .join("\n") || "No relationships available"
          }
        </ul>
        
        <h2>Details</h2>
        <p>${parsedContent.details || "No details available"}</p>
        
        <h2>Source Memories</h2>
        <div class="source-memories">
          <ol>
            ${
              parsedContent.sourceMemories
                ?.split("\n")
                .map((source) => source.trim())
                .filter(Boolean)
                .map((source) => `<li>${source.replace(/^\d+\.\s*/, "")}</li>`)
                .join("\n") || "No source memories available"
            }
          </ol>
        </div>
      </body>
      </html>
    `;
}

// Helper function to create and download a file
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Memory({ memory, onDelete, onExport }) {
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

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(new Date(timestamp));
  }

  const TypeIcon = typeIcons[memory.type] || DocumentIcon;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleExportMenu = () => {
    setShowExportMenu(!showExportMenu);
  };

  const handleExport = async (format) => {
    const parsedContent =
      memory.type === "compressed"
        ? parseCompressedContent(memory.content)
        : parseRawContent(memory.content);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "markdown") {
      const markdownContent = generateMarkdown(memory, parsedContent);
      downloadFile(markdownContent, `memory-${timestamp}.md`);
    } else if (format === "pdf") {
      const htmlContent = generateHTML(memory, parsedContent);

      try {
        // Use Chrome's built-in print functionality to generate PDF
        const printWindow = window.open("", "_blank");
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for resources to load
        setTimeout(() => {
          printWindow.print();
          setTimeout(() => printWindow.close(), 500);
        }, 250);
      } catch (error) {
        console.error("Error generating PDF:", error);
        // Fallback: Offer HTML download if PDF generation fails
        downloadFile(htmlContent, `memory-${timestamp}.html`);
      }
    }

    setShowExportMenu(false);
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
  
    const sections = {
      summary: content.match(/SUMMARY:\s*(.*?)(?=\s*KEY POINTS:)/s)?.[1]?.trim(),
      keyPoints: content.match(/KEY POINTS:\s*(.*?)(?=\s*RELATIONSHIPS:)/s)?.[1]?.trim(),
      relationships: content.match(/RELATIONSHIPS:\s*(.*?)(?=\s*DETAILS:)/s)?.[1]?.trim(),
      details: content.match(/DETAILS:\s*(.*?)(?=\s*Source Memories:)/s)?.[1]?.trim(),
      sourceMemories: sourceMemoriesSection,
    };
  
    return {
      timestamp: timestampMatch ? timestampMatch[1] : '',
      memoryCount: sourceMemoriesCount,
      ...sections,
    };
  };

  const renderSection = (title, content, type = "text") => {
    if (!content) return null;

    const renderContent = () => {
      switch (type) {
        case "list":
          return (
            <ul className="space-y-2">
              {content
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                    <span>{item.replace(/^-\s*/, "")}</span>
                  </li>
                ))}
            </ul>
          );
        case "sources":
          return (
            <ol className="list-decimal list-inside space-y-2">
              {content
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item, idx) => (
                  <li key={idx} className="pl-2">
                    {item.replace(/^\d+\.\s*/, "")}
                  </li>
                ))}
            </ol>
          );
        case "context":
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
        <div className="text-sm text-gray-600">{renderContent()}</div>
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
            <StarIcon
              className="h-3.5 w-3.5 text-amber-500"
              aria-hidden="true"
            />
            <span className="text-xs font-medium ml-1 text-gray-600">
              {memory.importance}
            </span>
          </div>
          {memory.type === "compressed" ? (
            <div className="relative">
              <button
                onClick={toggleExportMenu}
                className="text-gray-400 hover:text-purple-600 transition-colors duration-300"
                aria-label="Export memory"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div
                    className="py-1"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="options-menu"
                  >
                    <button
                      onClick={() => handleExport("pdf")}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
                      role="menuitem"
                    >
                      Export as PDF
                    </button>
                    <button
                      onClick={() => handleExport("markdown")}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
                      role="menuitem"
                    >
                      Export as Markdown
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => onDelete(memory.id)}
              className="text-gray-400 hover:text-red-500 transition-colors duration-300"
              aria-label="Delete memory"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {memory.type === "compressed" ? (
          <>
            {renderSection("Summary", parsedContent.summary)}
            {isExpanded && (
              <div className="space-y-4">
                {renderSection("Key Points", parsedContent.keyPoints, "list")}
                {renderSection(
                  "Relationships",
                  parsedContent.relationships,
                  "list"
                )}
                {renderSection("Details", parsedContent.details)}
                {renderSection(
                  "Source Memories",
                  parsedContent.sourceMemories,
                  "sources"
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {renderSection(null, parsedContent.content)}
            {parsedContent.context &&
              renderSection(null, parsedContent.context, "context")}
          </div>
        )}

        {memory.type === "compressed" && (
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
        {memory.sourceCount && memory.type !== "compressed" && (
          <div className="flex items-center gap-1">
            <span
              className="w-1 h-1 rounded-full bg-gray-300"
              aria-hidden="true"
            />
            <span className="font-medium">{memory.sourceCount} sources</span>
          </div>
        )}
      </div>
    </div>
  );
}
