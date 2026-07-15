export const NICKNAME_MAX_LENGTH = 15;

type NicknameErrorBody = {
  error?: string;
  message?: string;
};

export function normalizeNickname(input: string): string {
  return input.trim();
}

export function validateNickname(input: string): string | null {
  const nickname = normalizeNickname(input);
  if (!nickname) return null;

  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.`;
  }

  if (/[\r\n\t]/.test(nickname)) {
    return "Nickname cannot include line breaks.";
  }

  return null;
}

export async function getNicknameApiErrorMessage(response: Response): Promise<string> {
  let body: NicknameErrorBody | null = null;
  try {
    body = (await response.json()) as NicknameErrorBody;
  } catch {
    body = null;
  }

  if (response.status === 409 || body?.error === "nickname_taken") {
    return "That nickname is already taken. Try another one.";
  }

  if (body?.error === "nickname_too_long") {
    return `Nickname must be ${NICKNAME_MAX_LENGTH} characters or fewer.`;
  }

  if (body?.error === "invalid_nickname_type") {
    return "Nickname must be plain text.";
  }

  return body?.message || "Couldn't save nickname. Please try again.";
}
