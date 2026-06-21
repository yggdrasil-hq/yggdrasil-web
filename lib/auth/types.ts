export type OnboardingState = "pending_username" | "active";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  onboardingState: OnboardingState;
  hasPassword: boolean;
  githubConnected: boolean;
  githubLogin: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}
