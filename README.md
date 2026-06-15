# DCAT Extract

A Nuxt 4 web application for processing and extracting metadata from datasets using AI-powered analysis. The application provides an interactive UI for uploading data sources, processing them through a job queue system, and exporting DCAT (Data Catalog Vocabulary) metadata.

## Features

- **Interactive Data Processing**: Step-by-step UI for dataset upload, schema selection, and metadata extraction
- **AI-Powered Analysis**: Automatic dataset inference, distribution analysis, and custom property derivation using configurable LLM models
- **Job Queue System**: BullMQ-backed background workers for file processing, cleanup, and downloads
- **WebSocket Support**: Real-time job status updates and bidirectional communication
- **Schema Management**: Built-in DCAT, DCTERMS, FOAF, PROV, and other semantic web vocabularies
- **Session Management**: Cookie-based session handling for user state
- **File Storage**: Flexible mount-based file storage system
- **Multi-format Support**: Process CSV, PDF, and other data formats

## Tech Stack

- **Frontend**: Nuxt 4 + Vue 3 + PrimeVue + TailwindCSS
- **Backend**: Nitro (Nuxt server) with WebSocket support
- **Job Queue**: BullMQ with Redis
- **AI Integration**: OpenAI-compatible LLM API
- **Testing**: Vitest + Happy DOM
- **Package Manager**: Bun

## Environment Variables

```bash
NUXT_REDIS_URL          # Redis connection URL (default: redis://default@localhost:6379)
NUXT_LLM_URL            # LLM API endpoint
NUXT_LLM_TOKEN          # LLM API authentication token
NUXT_LLM_MODEL          # Model selection (default: qwen/qwen3-8b)
NUXT_KAGGLE_USERNAME    # Kaggle API credentials (optional)
NUXT_KAGGLE_KEY         # Kaggle API key (optional)
NUXT_HF_TOKEN           # HuggingFace token for model access (optional)
NUXT_REMOVE_AI          # Disable AI features if set
NUXT_STOP_CLEANUP       # Disable cleanup worker if set
FILES_MOUNT             # Custom file storage mount path
```

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Run tests
bun test
```

## Project Structure

- **`app/`** - Vue components and frontend logic
  - `components/` - Reusable UI components (DataSourceStep, DataProcessingStep, etc.)
  - `pages/` - Application pages
  - `composables/` - Vue 3 composition functions
  - `theme/` - PrimeVue theme customization
  
- **`server/`** - Backend logic
  - `api/` - API endpoints for uploads, schema processing, job management
  - `workers/` - BullMQ background workers (file processing, cleanup, downloads)
  - `file-processor/` - Core ML/AI dataset analysis pipeline
  - `middleware/` - Session and authentication
  
- **`shared/`** - Shared types and utilities
  - `types/` - TypeScript interfaces (DCAT3, DTO, session types)
  - `utils/` - Common helpers (DCAT export, schema building)

- **`public/schemas/`** - RDF/TTL vocabulary definitions

## Key Workflows

1. **Data Upload**: Users upload datasets through the UI → stored in file system
2. **Processing**: Background worker analyzes data using AI (dataset inference, distribution analysis)
3. **Export**: Generate DCAT RDF metadata from processed data
4. **Download**: Retrieve processed files or metadata exports

## License

See LICENSE file for details.
