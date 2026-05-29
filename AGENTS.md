<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pet Notebook Continuity

- Treat prior Pet Notebook UI/UX fixes as product decisions, not temporary patches. Before changing a surface, check workspace daily memory for today's and yesterday's agreed behavior.
- At the end of each Pet Notebook work session, append the shipped improvements, verified behavior, and Lemon's explicit decisions to `C:\Users\L\.openclaw\workspace\memory\YYYY-MM-DD.md`.
- Do not "fix" Alerts when Lemon is reporting Events, Timeline, Log, Today, medication cards, or another specific surface. Verify the exact page/component path first.
- After OpenClaw/dev-server restarts or `/hewie` auth/layout changes, run `npm run check:floating-menu`; a plain `/hewie` 200 is not enough because the auth gate can render while hiding the floating menu.
- Keep the Today upcoming cards consistent with the May 27 approved look: compact two-column card grid, blue charged medication cards, simple pale meal card, bold medication names, `Give [dose] (Oral)` text, `With Food`/notes chips, and right-sized `Skip`/`Done` buttons. Do not redesign those upcoming cards without Lemon explicitly asking for a visual change.
