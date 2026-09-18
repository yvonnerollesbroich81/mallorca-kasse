export function calculateBalances(participantIds, expenses) {
  const balances = Object.fromEntries(participantIds.map((id) => [id, 0]));

  for (const expense of expenses) {
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new RangeError("Eine Ausgabe enthält einen ungültigen Betrag.");
    }

    if (!(expense.payerId in balances)) {
      throw new RangeError("Die zahlende Person gehört nicht zur Reise.");
    }

    const shareTotal = expense.shares.reduce((sum, share) => {
      if (!(share.participantId in balances) ||
          !Number.isSafeInteger(share.shareCents) ||
          share.shareCents < 0) {
        throw new RangeError("Eine Ausgabe enthält einen ungültigen Anteil.");
      }

      balances[share.participantId] -= share.shareCents;
      return sum + share.shareCents;
    }, 0);

    if (shareTotal !== expense.amountCents) {
      throw new RangeError("Die Anteile ergeben nicht den Gesamtbetrag.");
    }

    balances[expense.payerId] += expense.amountCents;
  }

  const total = Object.values(balances).reduce((sum, balance) => sum + balance, 0);
  if (total !== 0) {
    throw new Error("Die Summe der Salden ist nicht null.");
  }

  return balances;
}

function sortAccounts(accounts) {
  return accounts
    .filter((account) => account.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
}

export function calculateSettlements(balances) {
  const total = Object.values(balances).reduce((sum, balance) => sum + balance, 0);
  if (total !== 0) {
    throw new RangeError("Eine Abrechnung benötigt Salden mit einer Summe von null.");
  }

  const debtors = sortAccounts(
    Object.entries(balances)
      .filter(([, balance]) => balance < 0)
      .map(([id, balance]) => ({ id, amount: -balance })),
  );
  const creditors = sortAccounts(
    Object.entries(balances)
      .filter(([, balance]) => balance > 0)
      .map(([id, balance]) => ({ id, amount: balance })),
  );

  let best = null;
  const seen = new Map();

  function search(openDebtors, openCreditors, transfers) {
    if (openDebtors.length === 0) {
      if (openCreditors.length === 0 && (!best || transfers.length < best.length)) {
        best = transfers;
      }
      return;
    }

    if (best && transfers.length >= best.length) return;

    const key = `${openDebtors.map((item) => `${item.id}:${item.amount}`).join("|")}::${openCreditors.map((item) => `${item.id}:${item.amount}`).join("|")}`;
    const previousDepth = seen.get(key);
    if (previousDepth !== undefined && previousDepth <= transfers.length) return;
    seen.set(key, transfers.length);

    const debtor = openDebtors[0];
    for (let index = 0; index < openCreditors.length; index += 1) {
      const creditor = openCreditors[index];
      const amountCents = Math.min(debtor.amount, creditor.amount);

      const nextDebtors = openDebtors.map((item) => ({ ...item }));
      const nextCreditors = openCreditors.map((item) => ({ ...item }));
      nextDebtors[0].amount -= amountCents;
      nextCreditors[index].amount -= amountCents;

      search(
        sortAccounts(nextDebtors),
        sortAccounts(nextCreditors),
        [...transfers, { fromId: debtor.id, toId: creditor.id, amountCents }],
      );
    }
  }

  search(debtors, creditors, []);
  return best ?? [];
}

export function applySettlements(balances, settlements) {
  const result = { ...balances };

  for (const settlement of settlements) {
    if (!Number.isSafeInteger(settlement.amountCents) || settlement.amountCents <= 0) {
      throw new RangeError("Eine Ausgleichszahlung enthält einen ungültigen Betrag.");
    }

    result[settlement.fromId] += settlement.amountCents;
    result[settlement.toId] -= settlement.amountCents;
  }

  return result;
}
