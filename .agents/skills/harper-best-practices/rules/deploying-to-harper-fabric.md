---
name: deploying-to-harper-fabric
description: How to deploy a Harper application to the Harper Fabric cloud.
metadata:
  mode: generate
  sources:
    - reference/v5/components/applications.md#Remote Management
    - >-
        fabric/cluster-creation-management.md#Connecting the Harper CLI to a
        Cluster
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: ccdefbbf8f3b8657
---

# Deploying to Harper Fabric

Instructions for the agent to follow when deploying a Harper application to the Harper Fabric cloud using the Harper CLI.

## When to Use

Apply this rule when deploying a Harper application to a remote Harper instance or Harper Fabric cluster. This covers interactive deployments, CI/CD pipelines, and any scenario where the agent must push a local or remote package to a target environment.

## How It Works

1. **Authenticate with the remote target**: Run `harper login` once to store an authentication token. The CLI writes `HARPER_CLI_TARGET` to a local `.env` so subsequent commands do not need credentials repeated. Find the **Application URL** on the cluster's **Config → Overview** page (see [creating-a-fabric-account-and-cluster.md](creating-a-fabric-account-and-cluster.md)).

   ```bash
   harper login <Application URL>
   # Provide cluster username and password when prompted
   ```

2. **Deploy the application**: Run `harper deploy` with the required parameters. After logging in, no credentials are needed inline.

   ```bash
   harper deploy \
     project=<name> \
     package=<package> \
     target=<remote> \
     restart=true \
     replicated=true
   ```

3. **Choose a package source**: Set the `package` parameter to any valid npm dependency value, or omit it to package and deploy the current local directory.

   | Value                                                | Effect                                           |
   | ---------------------------------------------------- | ------------------------------------------------ |
   | _(omitted)_                                          | Packages and deploys the current local directory |
   | `"@harperdb/status-check"`                           | npm package                                      |
   | `"HarperDB/status-check"`                            | GitHub repo (short form)                         |
   | `"https://github.com/HarperDB/status-check"`         | GitHub repo (full URL)                           |
   | `"git+ssh://git@github.com:HarperDB/secret-app.git"` | Private repo via SSH                             |
   | `"https://example.com/application.tar.gz"`           | Remote tarball                                   |

   For git tags, use the `semver` directive for reliable versioning:

   ```
   HarperDB/application-template#semver:v1.0.0
   ```

4. **Authenticate for CI/CD pipelines**: Use environment variables instead of interactive login. Set credentials before running `harper deploy`.

   ```bash
   export HARPER_CLI_USERNAME=<username>
   export HARPER_CLI_PASSWORD=<password>
   harper deploy \
     project=<name> \
     package=<package> \
     target=<remote> \
     restart=true \
     replicated=true
   ```

5. **Register SSH keys for private repos**: Before deploying from an SSH-based private repository, use the Add SSH Key operation to register the key with the remote instance.

## Examples

**Interactive login then deploy (recommended):**

```bash
# Log in once
harper login <remote>
# Provide your username and password when prompted

# Subsequently deploy without credentials
harper deploy \
  project=<name> \
  package=<package> \
  target=<remote> \
  restart=true \
  replicated=true
```

**Deploy with inline credentials (not recommended for production):**

```bash
harper deploy \
  project=<name> \
  package=<package> \
  username=<username> \
  password=<password> \
  target=<remote> \
  restart=true \
  replicated=true
```

**Deploy a specific GitHub release by semver tag:**

```bash
harper deploy \
  project=my-app \
  package="HarperDB/application-template#semver:v1.0.0" \
  target=<remote> \
  restart=true \
  replicated=true
```

## Notes

- Always prefer `harper login` for interactive use and environment variables (`HARPER_CLI_USERNAME`, `HARPER_CLI_PASSWORD`) for CI/CD. Avoid inline `username`/`password` parameters in production.
- Omitting `package` causes the CLI to package the current local directory. Specifying a local file path creates a symlink, so changes are picked up between restarts without redeploying.
- Harper generates a `package.json` from component configurations and resolves dependencies using a form of `npm install`.
- For SSH-based private repos, register keys with the Add SSH Key operation before deploying.
