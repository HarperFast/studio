---
name: checking-authentication
description: How to handle user authentication and sessions in Harper Resources.
metadata:
  mode: generate
  sources:
    - >-
        reference/v5/resources/resource-api.md#`getCurrentUser(): User |
        undefined`
    - reference/v5/resources/resource-api.md#Session and Login from a Resource
    - reference/v5/security/jwt-authentication.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: fdd9ec3b11011490
---

# Checking Authentication

Instructions for the agent to follow when handling user authentication and session management inside Harper Resources.

## When to Use

Apply this rule when implementing authentication checks, login/logout flows, or token issuance inside a custom Resource. Use it any time a Resource needs to identify the current user, establish a session, or issue JWTs to clients. See [custom-resources.md](custom-resources.md) for the general Resource authoring pattern.

## How It Works

1. **Check the current user** with `getCurrentUser()`. Call it inside any Resource method to retrieve the authenticated user or `undefined` if no user is authenticated. Guard protected endpoints by returning a `401` when the result is `undefined`.

   ```javascript
   async get(target) {
     const user = this.getCurrentUser();
     if (!user) return new Response(null, { status: 401 });
     return { username: user.username, role: user.role };
   }
   ```

   The returned object exposes `username`, `role`, and `role.permission` flags.

2. **Enable sessions** before using session-based login. Set `authentication.enableSessions: true` in `harperdb-config.yaml`:

   ```yaml
   authentication:
     enableSessions: true
   ```

3. **Access login and session helpers** via `getContext()`. The context object exposes `context.login` and `context.session` for sign-in/out flows.
   - Call `context.login(username, password)` to verify credentials and establish a session cookie on success.
   - To end a session, delete it via `context.session.delete(context.session.id)`.

4. **Implement sign-in and sign-out Resources** using the context helpers:

   ```javascript
   export class SignIn extends Resource {
   	async post(_target, data) {
   		const context = this.getContext();
   		try {
   			await context.login(data.username, data.password);
   		} catch {
   			return new Response('Invalid credentials', { status: 403 });
   		}
   		return new Response('Logged in', { status: 200 });
   	}
   }

   export class SignOut extends Resource {
   	async post() {
   		const context = this.getContext();
   		if (!context.session) { return new Response(null, { status: 401 }); }
   		await context.session.delete(context.session.id);
   		return new Response('Logged out', { status: 200 });
   	}
   }
   ```

5. **Issue JWTs for non-browser clients** (CLI tools, mobile apps, service-to-service). Cookie-based sessions are intended for browser clients. For other clients, mint tokens programmatically using `server.operation()`:

   ```javascript
   import { Resource, server } from 'harper';

   export class IssueTokens extends Resource {
   	static async get(_target, context) {
   		const { operation_token, refresh_token } = await server.operation(
   			{ operation: 'create_authentication_tokens' },
   			context,
   			true,
   		);
   		return { operation_token, refresh_token };
   	}

   	static async post(_target, data) {
   		const { username, password } = await data;
   		if (!username || !password) {
   			return new Response('username and password required', { status: 400 });
   		}
   		const { operation_token, refresh_token } = await server.operation({
   			operation: 'create_authentication_tokens',
   			username,
   			password,
   		});
   		return { operation_token, refresh_token };
   	}
   }

   export class RefreshJWT extends Resource {
   	static async post(_target, data) {
   		const { refresh_token } = await data;
   		if (!refresh_token) {
   			return new Response('refresh_token required', { status: 400 });
   		}
   		const { operation_token } = await server.operation({
   			operation: 'refresh_operation_token',
   			refresh_token,
   		});
   		return { operation_token };
   	}
   }
   ```

   Pass `true` as the third argument to `server.operation()` when the operation should run as the current authenticated user. Omit it or pass `false` when the operation supplies its own credentials.

6. **Configure JWT token expiry** in `harperdb-config.yaml` under the `authentication` section:

   ```yaml
   authentication:
     operationTokenTimeout: 1d
     refreshTokenTimeout: 30d
   ```

   Duration strings follow the `jsonwebtoken` package format (e.g., `1d`, `12h`, `60m`).

## Examples

**Protecting a resource endpoint and returning user info:**

```javascript
async get(target) {
  const user = this.getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  return { username: user.username, role: user.role };
}
```

**Full session-based sign-in/sign-out flow:**

```javascript
export class SignIn extends Resource {
	async post(_target, data) {
		const context = this.getContext();
		try {
			await context.login(data.username, data.password);
		} catch {
			return new Response('Invalid credentials', { status: 403 });
		}
		return new Response('Logged in', { status: 200 });
	}
}

export class SignOut extends Resource {
	async post() {
		const context = this.getContext();
		if (!context.session) { return new Response(null, { status: 401 }); }
		await context.session.delete(context.session.id);
		return new Response('Logged out', { status: 200 });
	}
}
```

**JWT token refresh endpoint:**

```javascript
export class RefreshJWT extends Resource {
	static async post(_target, data) {
		const { refresh_token } = await data;
		if (!refresh_token) {
			return new Response('refresh_token required', { status: 400 });
		}
		const { operation_token } = await server.operation({
			operation: 'refresh_operation_token',
			refresh_token,
		});
		return { operation_token };
	}
}
```

## Notes

- `getCurrentUser()` and `getContext()` are instance methods; call them with `this` inside non-static Resource methods.
- `enableSessions` must be `true` in config before `context.login` or `context.session` will function.
- Cookie-based sessions target browser clients. Use JWT issuance via `server.operation()` for all other client types.
- When both `operation_token` and `refresh_token` have expired, the client must call `create_authentication_tokens` again with credentials.
