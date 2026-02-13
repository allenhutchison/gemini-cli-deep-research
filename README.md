# gemini-deep-research
A deep research extension for Gemini CLI

## Configuration

To use this extension, you must provide a Google GenAI API key. You can set it using one of the following environment variables (in order of priority):

1.  `GEMINI_DEEP_RESEARCH_API_KEY`
2.  `GEMINI_API_KEY`

If neither is set, the MCP server will exit with an error.

You can also configure the default model used for queries (not the deep research agent) using:

1.  `GEMINI_DEEP_RESEARCH_MODEL`
2.  `GEMINI_MODEL`

If neither is set, it defaults to `models/gemini-flash-latest`.

## Installation
Install the extension with:

```sh
gemini extensions install https://github.com/allenhutchison/gemini-cli-deep-research --auto-update
```
