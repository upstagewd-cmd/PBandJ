# PB&J Development Instructions

PB&J is a men's pickleball community application.

## Stack

Frontend:
- React
- TypeScript
- Vite
- Tailwind

Backend:
- Express
- TypeScript

Database:
- PostgreSQL
- Drizzle ORM

Authentication:
- Clerk

Hosting:
- Railway

Database Hosting:
- Neon

Storage:
- Cloudflare R2 (future use)

## Development Rules

- Preserve existing functionality
- Do not remove Clerk authentication
- Do not replace database architecture
- Avoid unnecessary dependencies
- Follow existing coding patterns
- Keep mobile-first design
- Maintain PWA functionality

Before making large changes:
- Explain the approach
- Identify impacted files
- Avoid breaking existing flows

## Product Goals

PB&J focuses on:
- Men's pickleball fellowship
- Tournament management
- Open play
- Player profiles
- Rankings
- Badges
- Community engagement

## AI Development Workflow

When proposing changes:

1. First inspect existing patterns.
2. Identify all impacted files.
3. Explain the implementation approach before editing.
4. Prefer small incremental changes.
5. Preserve existing working functionality.
6. Do not rewrite working systems unnecessarily.

For UI changes:
- Maintain mobile-first design.
- Consider PWA usage.
- Prioritize simple user flows.
- Optimize for non-technical users.

For database changes:
- Explain schema impacts before modifying.
- Prefer migrations over destructive changes.
- Preserve existing data.

For production changes:
- Assume Railway is production.
- Do not change environment variables without explaining why.