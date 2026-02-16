# gemini-deep-research
A deep research extension for Gemini CLI

## Requirements

**A paid Google AI API key is required.** Deep Research uses the Gemini Interactions API, which has separate quota from standard Gemini model calls. Free-tier API keys do not have access and will receive a `429 Too Many Requests` quota error.

Get a paid key from [Google AI Studio](https://aistudio.google.com/apikey) and ensure billing is enabled on your Google Cloud project.

## Configuration

Set your API key using one of the following environment variables (in order of priority):

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
