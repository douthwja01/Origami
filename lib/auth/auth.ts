import { authenticateUser } from "@/lib/auth/users";

/** @deprecated Use authenticateUser from lib/auth/users.ts */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const user = await authenticateUser(username, password);
  return user !== null;
}

export { authenticateUser };
