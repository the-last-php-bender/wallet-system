/**
 * Money utility functions for kobo-based calculations.
 * All amounts are strictly represented as kobo (smallest currency unit).
 * This eliminates floating-point precision errors and maintains strict typing.
 */

const MINIMUM_AMOUNT_KOBO = 1n;
const MAXIMUM_AMOUNT_KOBO = 999999999999999999n;

/**
 * Validates that an amount string is a valid kobo integer.
 * @throws {Error} if amount is invalid
 */
export function validateAmount(amount: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(amount);
  } catch {
    throw new Error(`Invalid amount format: "${amount}" must be a positive integer string`);
  }

  if (parsed < MINIMUM_AMOUNT_KOBO) {
    throw new Error(
      `Amount must be at least ${MINIMUM_AMOUNT_KOBO} kobo (₦${(MINIMUM_AMOUNT_KOBO / 100n).toString()})`
    );
  }

  if (parsed > MAXIMUM_AMOUNT_KOBO) {
    throw new Error(
      `Amount exceeds maximum of ${MAXIMUM_AMOUNT_KOBO} kobo (₦${(MAXIMUM_AMOUNT_KOBO / 100n).toString()})`
    );
  }

  return parsed;
}

export function normalizeAmount(rawAmount: string): { amountKobo: bigint; normalizedAmount: string } {
  const amountKobo = validateAmount(rawAmount);
  return {
    amountKobo,
    normalizedAmount: koboToString(amountKobo),
  };
}

/**
 * Adds two kobo amounts safely.
 */
export function addKobo(a: bigint, b: bigint): bigint {
  const result = a + b;
  if (result > MAXIMUM_AMOUNT_KOBO) {
    throw new Error(
      `Amount overflow: ${a} + ${b} exceeds maximum of ${MAXIMUM_AMOUNT_KOBO}`
    );
  }
  return result;
}

/**
 * Subtracts two kobo amounts safely.
 */
export function subtractKobo(a: bigint, b: bigint): bigint {
  if (a < b) {
    throw new Error(`Insufficient balance: ${a} < ${b}`);
  }
  return a - b;
}

/**
 * Parses a wallet balance string to bigint.
 */
export function parseBalance(balanceStr: string): bigint {
  try {
    return BigInt(balanceStr);
  } catch {
    throw new Error(`Invalid balance format: "${balanceStr}"`);
  }
}

/**
 * Converts kobo amount to string for storage/transmission.
 */
export function koboToString(amount: bigint): string {
  return amount.toString();
}
