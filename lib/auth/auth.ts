import bcrypt from "bcryptjs";

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const expectedUser = process.env.ORIGAMI_USER || "admin";
  if (username !== expectedUser) {
    return false;
  }

  const hash = process.env.ORIGAMI_PASSWORD_HASH;
  const plain = process.env.ORIGAMI_PASSWORD;

  if (hash) {
    return bcrypt.compare(password, hash);
  }
  if (plain) {
    return password === plain;
  }
  return false;
}
