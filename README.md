# Orma: AI-Powered Memory Extension

<div align="center">
  <img src="assets/orma-logo.png" alt="Orma Logo" width="200"/>
  <p><em>Your Second Brain, Powered by AI</em></p>
</div>

Orma(ഓര്‍മ്മ means "Memory" in Malayalam) is a powerful browser extension that serves as your digital memory companion, using advanced AI leveraging Chrome's built-in AI(Google Nano) to help you remember, understand, and connect information from your web browsing experience.

## Features

- **Smart Memory Capture**: Instantly save any web content with AI-powered processing
- **Intelligent Processing**: Automatically extracts, analyzes, and organizes content
- **Real-time Status Updates**: Clean, modern UI showing operation progress
- **Vector Search**: Find related memories using state-of-the-art semantic search
- **Project Organization**: Group related memories into projects
- **Interactive Chat**: Engage with your memories through natural conversation
- **Context Generation For LLMs**: Easily generate context for LLMs like ChatGPT, Claude, etc
- **Knowledge Quiz**: Test and reinforce your understanding
- **Project Summary**: One-click summary of all memories in a project using Google Nano AI Agents and auto export to Markdown

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- Chrome browser (v88 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ronnakamoto/orma.git
   cd orma
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory from your Orma project

## 🛠️ Technology Stack

- **Frontend**: React 18, TailwindCSS
- **State Management**: Local state with React hooks
- **UI Components**: Headless UI, Heroicons
- **Animations**: Framer Motion
- **AI Processing**: Google Nano AI, OpenAI, Transformers.js
- **Storage**: IndexedDB (Dexie.js)
- **Vector Search**: HNSWLib
- **Build Tools**: Laravel Mix, PostCSS

## Core Features

### Memory Processing Pipeline

1. **Content Extraction**
   - Intelligent webpage content extraction
   - Clean-up and preprocessing
   - Token management and chunking

2. **AI Processing**
   - Content analysis and enhancement
   - Importance calculation
   - Vector embedding generation

3. **Storage and Organization**
   - Efficient IndexedDB storage
   - Vector-based similarity search
   - Project-based organization

4. **Real-time Status Updates**
   - Progress tracking
   - Operation status visualization
   - Error handling and recovery

## API Configuration

To use Orma's AI features, you'll need to configure your API keys as OpenAI is used to generate the vector embeddings:

1. Open the extension
2. Go to Settings
3. Enter your OpenAI API key
4. Save changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

<div align="center">
  Made with ❤️ by RonNakamoto
</div>
