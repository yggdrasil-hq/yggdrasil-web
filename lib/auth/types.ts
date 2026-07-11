export type OnboardingState = "pending_username" | "active";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  onboardingState: OnboardingState;
  githubLogin: string;
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
