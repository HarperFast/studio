---
name: creating-a-fabric-account-and-cluster
description: How to create a Harper Fabric account, organization, and cluster.
metadata:
  mode: synthesized
---

# Creating a Harper Fabric Account and Cluster

Follow these steps to set up your Harper Fabric environment for deployment.

## How It Works

1. **Sign Up/In**: Go to [https://fabric.harper.fast/](https://fabric.harper.fast/) and sign up or sign in.
2. **Create an Organization**: Create an organization (org) to manage your projects.
3. **Create a Cluster**: Create a new cluster. This can be on the free tier, no credit card required.
4. **Set Credentials**: During setup, set the cluster username and password to finish configuring it.
5. **Get Application URL**: Navigate to the **Config** tab and copy the **Application URL**.
6. **Configure Environment**: Update your `.env` file or GitHub Actions secrets with cluster-specific credentials.
7. **Next Steps**: See the [deploying-to-harper-fabric](deploying-to-harper-fabric.md) rule for detailed instructions on deploying your application successfully.

## Examples

### Environment Configuration

```bash
CLI_TARGET_USERNAME='YOUR_CLUSTER_USERNAME'
CLI_TARGET_PASSWORD='YOUR_CLUSTER_PASSWORD'
CLI_TARGET='YOUR_CLUSTER_URL'
```
