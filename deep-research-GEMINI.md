# Gemini Deep Research Extension

This extension provides tools for performing Deep Research and managing File Search stores for Retrieval Augmented Generation (RAG). It maintains a local workspace state to simplify the research workflow.

## Requirements

**A paid Google AI API key is required.** Deep Research uses the Gemini Interactions API, which has separate quota from standard Gemini model calls. Free-tier API keys do not have access to this feature and will receive a `429 Too Many Requests` quota error.

To configure your API key:
1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and ensure billing is enabled
2. Run `gemini extensions config gemini-deep-research` to configure the key via extension settings

> **Note:** The Gemini CLI strips environment variables containing sensitive patterns (like "KEY") from MCP server processes. Setting `GEMINI_API_KEY` in your shell alone will **not** make it available to extensions. Use extension settings instead — they bypass this restriction and store the key securely in your system keychain.

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
- `research_start`: Start a long-running background research task. You can ground it in your uploaded files by providing `fileSearchStoreNames`. Use `report_format` to specify the desired output structure (e.g., "Executive Brief", "Technical Deep Dive", "Comprehensive Research Report"). Pass `outputPath` to have the server write the markdown report to that file automatically when research completes — recommended for the typical "kick it off and come back later" flow, since it removes the need for the agent to poll or save explicitly.
- `research_status`: Check if the research is done and retrieve the results. Only needed when `outputPath` was *not* given to `research_start`, or when the user wants a progress update mid-flight.
- `research_save_report`: Save the findings as a Markdown report. Only needed when `outputPath` was not given to `research_start`, or when the user wants a second copy in a different location.

## Tool Dependencies & Workflow

When performing research or querying data, strictly follow this ordering:

1.  **Preparation (If files are involved)**:
    -   First, check if a suitable store exists using `file_search_list_stores`.
    -   If not, create one using `file_search_create_store`.
    -   Upload necessary files or directories using `file_search_upload`. **Crucial**: Grounding only works on files that have been successfully uploaded to a store.

2.  **Execution**:
    -   For broad, multi-step investigations: Use `research_start`. The bundled `deep-research-start` skill auto-activates when the user asks for a deep research / investigation / comprehensive report and walks through prompt refinement, format selection, grounding, and the `research_start` call.
    -   For direct questions about specific files: Use `file_search_query`.

3.  **Completion**:
    -   Preferred: pass `outputPath` to `research_start` so the report writes itself when research finishes (10–30 minutes typical). The user can keep working in the meantime; when they ask about the results, read the file.
    -   Fallback (no `outputPath`): use `research_status` to monitor and `research_save_report` to write the Markdown when status is `completed`.
    -   On failure with `outputPath` set, the file is still written but contains an error message and the interaction ID, which can be passed to `research_status` for further inspection.

Always provide the user with the Research ID or Store Name when initiating background tasks or creating resources.