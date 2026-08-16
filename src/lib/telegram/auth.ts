import { TelegramClient, Api } from "telegram";
// @ts-ignore
import { computeCheck } from "telegram/Password";

/**
 * Verifies the user's 2FA Cloud Password against Telegram MTProto.
 * Guarantees strict string type handling and SRP computation.
 */
export async function submitTwoFactorPassword(
  client: TelegramClient,
  rawPassword: string
): Promise<string> {
  const password = String(rawPassword || "").trim();
  if (!password) {
    throw new Error("Password cannot be empty");
  }

  try {
    // 1. Fetch current 2FA password configuration & SRP challenge from Telegram
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    
    // 2. Compute SRP hash payload with sanitized password string
    const passwordSrp = await computeCheck(passwordInfo, password);
    
    // 3. Send CheckPassword RPC
    await client.invoke(
      new Api.auth.CheckPassword({
        password: passwordSrp,
      })
    );

    // 4. Export authenticated session
    const sessionString = client.session.save() as unknown as string;
    return sessionString;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("PASSWORD_HASH_INVALID")) {
      throw new Error("Invalid Two-Step Verification password");
    }
    if (message.includes("FLOOD_WAIT")) {
      throw new Error("Too many attempts. Please wait a few minutes.");
    }

    console.error("[2FA Auth] Verification error:", error);
    throw new Error(message || "Failed to verify 2FA password");
  }
}
