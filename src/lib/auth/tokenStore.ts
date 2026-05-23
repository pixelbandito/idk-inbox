export interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const SAFETY_MARGIN_MS = 60_000;

export class TokenStore {
  private token: StoredToken | null = null;

  set(accessToken: string, expiresInSeconds: number, now: number = Date.now()): void {
    this.token = { accessToken, expiresAt: now + expiresInSeconds * 1000 };
  }

  get(): StoredToken | null {
    return this.token;
  }

  isValid(now: number = Date.now()): boolean {
    if (!this.token) return false;
    return this.token.expiresAt - SAFETY_MARGIN_MS > now;
  }

  clear(): void {
    this.token = null;
  }
}
