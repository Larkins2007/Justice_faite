# Security notes

- The first owner is bootstrapped with a one-time key printed to server logs. The key is removed from the local data directory after successful setup.
- Passwords are derived with Node's scrypt implementation and unique random salts.
- Session identifiers are random, stored as SHA-256 hashes, marked HttpOnly and SameSite=Lax; production cookies are Secure.
- Mutating authenticated requests require a per-session CSRF token.
- Login, registration and comments have basic in-memory rate limits.
- Markdown is converted on the server using escaped text and a small allowlist of formatting constructs. Arbitrary HTML is not rendered.
- User comments are escaped in the browser and require owner approval before public display.
- Bot statistics require a server-side bearer secret.
- Keep the `data/` directory and all environment secrets out of source control.

Before opening public registration broadly, consider setting clear community conduct rules for site comments and periodically reviewing accounts.
