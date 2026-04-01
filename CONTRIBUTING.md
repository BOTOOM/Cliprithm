# Contributing to Cliprithm

Thank you for your interest in contributing to Cliprithm! This guide will help you get started.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Cliprithm.git`
3. Create a branch: `git checkout -b feat/your-feature`
4. Make your changes
5. Push and open a Pull Request

## Development Setup

### Prerequisites

- **Node.js** 22+
- **Rust** (latest stable via [rustup](https://rustup.rs/))
- **FFmpeg** installed and available in PATH
- **Tauri prerequisites** for your OS: [Tauri setup guide](https://v2.tauri.app/start/prerequisites/)

### Install & Run

```bash
# Install frontend dependencies
npm install

# Start dev mode (Vite + Tauri)
npm run tauri dev
```

### Build

```bash
# Build frontend
npm run build

# Build Tauri app
npm run tauri build
```

### Type Check

```bash
# Frontend
npx tsc --noEmit

# Rust
cd src-tauri && cargo check
```

## Project Structure

```
cliprithm/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # UI components
│   ├── stores/             # Zustand state management
│   ├── services/           # Database, FFmpeg services
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # i18n, logger, utilities
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri commands (FFmpeg, library, media server)
│   │   └── lib.rs          # App setup, migrations, plugins
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets (logo, etc.)
└── .github/                # CI/CD workflows, templates
```

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                          |
|------------|--------------------------------------|
| `feat`     | A new feature                        |
| `fix`      | A bug fix                            |
| `docs`     | Documentation only changes           |
| `style`    | Code style (formatting, no logic)    |
| `refactor` | Code refactoring                     |
| `test`     | Adding or fixing tests               |
| `chore`    | Build process, dependencies, config  |
| `perf`     | Performance improvements             |

### Scopes

`editor`, `timeline`, `export`, `detection`, `ui`, `rust`, `i18n`, `ci`

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Fill in the PR template completely
3. Ensure TypeScript and Rust both compile without errors
4. Address any review feedback

### PR Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `cd src-tauri && cargo check` passes
- [ ] New features include i18n translations (en + es)
- [ ] UI changes match the existing design system
- [ ] No unnecessary dependencies added

## Bug Reports & Feature Requests

- Use [Bug Report](https://github.com/BOTOOM/Cliprithm/issues/new?template=bug_report.yml) template
- Use [Feature Request](https://github.com/BOTOOM/Cliprithm/issues/new?template=feature_request.yml) template

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
