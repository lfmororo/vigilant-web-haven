export const generateTemporaryPassword = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  const randomPart = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${randomPart}@1`;
};