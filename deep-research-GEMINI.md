# Gemini Deep Research Extension

This extension provides tools for performing Deep Research and managing File Search stores for Retrieval Augmented Generation (RAG). It maintains a local workspace state to simplify the research workflow.

## Requirements

**A paid Google AI API key is required.** Deep Research uses the Gemini Interactions API, which has separate quota from standard Gemini model calls. Free-tier API keys do not have access to this feature and will receive a `429 Too Many Requests` quota error.

To get a paid key:
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Ensure billing is enabled on your Google Cloud project
3. Set the key via `GEMINI_DEEP_RESEARCH_API_KEY` or `GEMINI_API_KEY` environment variable

## Workspace Caching

The extension automatically manages a `.gemini-research.json` file in the current working directory. This file caches:
-   **Research IDs**: Keeps track of initiated deep research interactions.
-   **File Search Store Mappings**: Maps user-friendly display names to their corresponding cloud resource names (e.g., `fileSearchStores/...`).

**Dependency Note**: Tools that take a `storeName` often expect the full resource name. You can use `file_search_list_stores` to retrieve these from the local cache.

## Available Tools

### File Search Management
- `file_search_create_store`: Create a new store for your documents.
- `file_search_list_stores`: See all your available stores (retrieved from local cache).
- `file_search_upload`: Upload a single file or recursively upload a directory to a store.
- `file_search_delete_store`: Remove a store when it's no longer needed.
- `file_search_query`: Ask a specific question against a file search store for grounded answers.

### Deep Research
- `research_start`: Start a long-running background research task. You can ground it in your uploaded files by providing `fileSearchStoreNames`. Use `report_format` to specify the desired output structure (e.g., "Executive Brief", "Technical Deep Dive", "Comprehensive Research Report").
- `research_status`: Check if the research is done and retrieve the results.
- `research_save_report`: Once completed, save the findings as a professional Markdown report.

## Tool Dependencies & Workflow

When performing research or querying data, strictly follow this ordering:

1.  **Preparation (If files are involved)**:
    -   First, check if a suitable store exists using `file_search_list_stores`.
    -   If not, create one using `file_search_create_store`.
    -   Upload necessary files or directories using `file_search_upload`. **Crucial**: Grounding only works on files that have been successfully uploaded to a store.

2.  **Execution**:
    -   For broad, multi-step investigations: Use `research_start`.
    -   For direct questions about specific files: Use `file_search_query`.

3.  **Completion**:
    -   For deep research, use `research_status` to monitor progress.
    -   Finalize by generating a report with `research_save_report`.

Always provide the user with the Research ID or Store Name when initiating background tasks or creating resources.