# Repository Working Rules

- Commit and push after every major completed change.
- Do not include local verification artifacts in commits unless they are explicitly required source assets.
- Keep PDF payloads and generated Base64 content out of logs, docs, and commits.
- Before starting any local LLM instance or benchmark path that can spawn one, first check whether an existing LLM process or listener is already running, such as `llama-server` on the expected port. Reuse the existing instance when possible and do not start a second copy on the same machine unless explicitly required.
