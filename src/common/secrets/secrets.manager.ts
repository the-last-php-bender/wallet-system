import { config as envConfig } from '../../../config/environment';

export interface SecretProvider {
  getSecret(key: string): Promise<string | null>;
  getSecretOrThrow(key: string): Promise<string>;
}

class EnvironmentSecretProvider implements SecretProvider {
  async getSecret(key: string): Promise<string | null> {
    return process.env[key] ?? null;
  }

  async getSecretOrThrow(key: string): Promise<string> {
    const value = await this.getSecret(key);
    if (value === null) {
      throw new Error(`Required secret '${key}' is not set.`);
    }
    return value;
  }
}

class VaultSecretProvider implements SecretProvider {
  private baseUrl: string;
  private token: string;

  constructor(vaultAddr: string, vaultToken: string) {
    this.baseUrl = `${vaultAddr}/v1`;
    this.token = vaultToken;
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/secret/data/${key}`, {
        headers: { 'X-Vault-Token': this.token },
      });
      if (!response.ok) return null;
      const body = await response.json() as { data?: { data?: Record<string, unknown> } };
      return (body.data?.data?.[key] as string) ?? null;
    } catch {
      return null;
    }
  }

  async getSecretOrThrow(key: string): Promise<string> {
    const value = await this.getSecret(key);
    if (value === null) {
      throw new Error(`Vault secret '${key}' is not set.`);
    }
    return value;
  }
}

let provider: SecretProvider | null = null;

export function getSecretProvider(): SecretProvider {
  if (provider !== null) return provider;

  const vaultAddr = envConfig.secrets?.vaultAddr;
  const vaultToken = envConfig.secrets?.vaultToken;

  if (vaultAddr && vaultToken) {
    provider = new VaultSecretProvider(vaultAddr, vaultToken);
  } else {
    provider = new EnvironmentSecretProvider();
  }

  return provider;
}

export async function resolveSecret(key: string): Promise<string> {
  return getSecretProvider().getSecretOrThrow(key);
}

export { EnvironmentSecretProvider, VaultSecretProvider };
