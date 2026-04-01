# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub Security Advisories](https://github.com/BOTOOM/Cliprithm/security/advisories/new) to report vulnerabilities privately.

### Response Timeline

- **48 hours**: Acknowledgment of your report
- **5 business days**: Initial assessment and severity classification
- **Release notes**: Contributors will be credited (optionally) in the release that addresses the vulnerability

### In Scope

- Authentication or authorization bypasses
- Data exposure or leakage
- XSS in the webview layer
- Injection vulnerabilities in Rust backend or FFmpeg commands
- Insecure data storage (SQLite, local files)
- Dependency vulnerabilities with known exploits

### Out of Scope

- Third-party services (GitHub, FFmpeg upstream)
- Social engineering attacks
- Denial of service attacks
- Issues requiring physical access to the device
- Vulnerabilities in development dependencies only

## Best Practices

- Never commit secrets or credentials
- Keep dependencies updated
- Follow the principle of least privilege
- Validate and sanitize all user input, especially file paths passed to FFmpeg
