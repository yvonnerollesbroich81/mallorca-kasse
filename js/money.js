const EURO_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEuro(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError("Der Centbetrag muss eine ganze Zahl sein.");
  }

  return EURO_FORMATTER.format(cents / 100);
}

export function formatSignedEuro(cents) {
  const formatted = formatEuro(Math.abs(cents));
  if (cents > 0) return `+ ${formatted}`;
  if (cents < 0) return `− ${formatted}`;
  return formatted;
}

export function parseEuroToCents(value) {
  const compact = String(value ?? "")
    .trim()
    .replace(/[€\s\u00a0]/g, "");

  if (!compact || compact.startsWith("-") || compact.startsWith("+")) {
    return null;
  }

  if (!/^\d+(?:[.,]\d+)*$/.test(compact)) {
    return null;
  }

  const commaIndex = compact.lastIndexOf(",");
  const dotIndex = compact.lastIndexOf(".");
  let euros;
  let fraction = "";

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalIndex = Math.max(commaIndex, dotIndex);
    const decimalMark = compact[decimalIndex];
    const thousandsMark = decimalMark === "," ? "." : ",";
    const integerPart = compact.slice(0, decimalIndex);
    fraction = compact.slice(decimalIndex + 1);

    if (!/^\d{1,3}(?:[.,]\d{3})*$/.test(integerPart) ||
        !integerPart.includes(thousandsMark) ||
        fraction.length < 1 || fraction.length > 2) {
      return null;
    }

    euros = integerPart.replaceAll(thousandsMark, "");
  } else if (commaIndex >= 0 || dotIndex >= 0) {
    const mark = commaIndex >= 0 ? "," : ".";
    const groups = compact.split(mark);

    if (groups.length === 2 && groups[1].length >= 1 && groups[1].length <= 2) {
      [euros, fraction] = groups;
    } else if (groups.length >= 2 && groups.slice(1).every((group) => group.length === 3)) {
      euros = groups.join("");
    } else {
      return null;
    }
  } else {
    euros = compact;
  }

  const centsText = `${euros}${fraction.padEnd(2, "0")}`;
  const cents = Number(centsText);

  return Number.isSafeInteger(cents) ? cents : null;
}

export function splitAmount(amountCents, participantIds) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("Der Betrag muss eine positive ganze Centzahl sein.");
  }

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new RangeError("Mindestens eine Person muss beteiligt sein.");
  }

  if (new Set(participantIds).size !== participantIds.length) {
    throw new RangeError("Eine Person darf nur einmal beteiligt sein.");
  }

  const baseShare = Math.floor(amountCents / participantIds.length);
  const remainder = amountCents % participantIds.length;

  return participantIds.map((participantId, index) => ({
    participantId,
    shareCents: baseShare + (index < remainder ? 1 : 0),
  }));
}
