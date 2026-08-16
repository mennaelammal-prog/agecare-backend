export type RegistrationValidationError = "passwordTooShort" | "passwordsDoNotMatch" | null;

export function getRegistrationValidationError(password: string, confirmation: string): RegistrationValidationError {
  if (password.length < 6) return "passwordTooShort";
  if (password !== confirmation) return "passwordsDoNotMatch";
  return null;
}
