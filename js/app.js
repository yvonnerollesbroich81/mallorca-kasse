import { calculateBalances, calculateSettlements } from "./calculations.js";
import { formatEuro, formatSignedEuro, parseEuroToCents, splitAmount } from "./money.js";
import { isConfigured } from "./config.js";
import { createSupabaseService } from "./supabase-service.js";

const PERSON_ORDER = ["Yvonne", "Alice", "Birgit", "Svenja"];
const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
});

const state = {
  service: null,
  session: null,
  participants: [],
  expenses: [],
  currentParticipant: null,
  photoUrl: null,
  activeScreen: "overview",
  editingExpenseId: null,
  pendingDeleteId: null,
  submitting: false,
  deleting: false,
  channel: null,
  webMcpController: null,
  intentionalLogout: false,
  refreshTimer: null,
  toastTimer: null,
};

const dom = {
  offlineBanner: document.querySelector("#offline-banner"),
  loginView: document.querySelector("#login-view"),
  loginForm: document.querySelector("#login-form"),
  loginEmail: document.querySelector("#login-email"),
  loginPassword: document.querySelector("#login-password"),
  loginButton: document.querySelector("#login-button"),
  loginError: document.querySelector("#login-error"),
  setupNotice: document.querySelector("#setup-notice"),
  appView: document.querySelector("#app-view"),
  accessView: document.querySelector("#access-view"),
  heroPhoto: document.querySelector("#hero-photo"),
  heroPlaceholder: document.querySelector("#hero-placeholder"),
  sessionName: document.querySelector("#session-name"),
  logoutButton: document.querySelector("#logout-button"),
  content: document.querySelector(".content"),
  screens: [...document.querySelectorAll("[data-screen]")],
  nav: document.querySelector(".bottom-nav"),
  navButtons: [...document.querySelectorAll("[data-screen-target]")],
  syncStatus: document.querySelector("#sync-status"),
  balanceGrid: document.querySelector("#balance-grid"),
  overviewTotal: document.querySelector("#overview-total"),
  overviewAddButton: document.querySelector("#overview-add-button"),
  recentExpenses: document.querySelector("#recent-expenses"),
  expenseForm: document.querySelector("#expense-form"),
  expenseTitle: document.querySelector("#expense-title"),
  expenseKicker: document.querySelector("#expense-kicker"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  expenseAmount: document.querySelector("#expense-amount"),
  expenseDescription: document.querySelector("#expense-description"),
  payerOptions: document.querySelector("#payer-options"),
  beneficiaryOptions: document.querySelector("#beneficiary-options"),
  saveExpenseButton: document.querySelector("#save-expense-button"),
  formError: document.querySelector("#form-error"),
  amountError: document.querySelector("#amount-error"),
  descriptionError: document.querySelector("#description-error"),
  payerError: document.querySelector("#payer-error"),
  beneficiaryError: document.querySelector("#beneficiary-error"),
  expenseCount: document.querySelector("#expense-count"),
  allExpenses: document.querySelector("#all-expenses"),
  settlementTotal: document.querySelector("#settlement-total"),
  settlementBalances: document.querySelector("#settlement-balances"),
  settlementList: document.querySelector("#settlement-list"),
  deleteDialog: document.querySelector("#delete-dialog"),
  confirmDeleteButton: document.querySelector("#confirm-delete-button"),
  toast: document.querySelector("#toast"),
};

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function userMessage(error, context = "laden") {
  const message = String(error?.message ?? "").toLowerCase();
  const status = Number(error?.status ?? error?.statusCode ?? 0);

  if (!navigator.onLine || message.includes("failed to fetch") || message.includes("load failed")) {
    return "Keine Verbindung. Prüfe dein Internet und versuche es erneut.";
  }
  if (message.includes("invalid login credentials")) {
    return "E-Mail-Adresse oder Passwort stimmt nicht.";
  }
  if (message.includes("email not confirmed")) {
    return "Diese E-Mail-Adresse wurde noch nicht bestätigt.";
  }
  if (status === 401 || message.includes("jwt") || message.includes("refresh token")) {
    return "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.";
  }
  if (context === "foto") {
    return "Das private Gruppenfoto konnte nicht geladen werden.";
  }
  if (context === "speichern") {
    return "Die Ausgabe konnte nicht gespeichert werden. Bitte versuche es erneut.";
  }
  if (context === "löschen") {
    return "Die Ausgabe konnte nicht gelöscht werden. Bitte versuche es erneut.";
  }
  if (context === "anmelden") {
    return "Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut.";
  }
  return "Die Reisekasse konnte nicht geladen werden. Bitte versuche es erneut.";
}

function setInlineError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function clearFormErrors() {
  [dom.formError, dom.amountError, dom.descriptionError, dom.payerError, dom.beneficiaryError]
    .forEach((element) => setInlineError(element, ""));
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 3200);
}

function updateOnlineState() {
  dom.offlineBanner.hidden = navigator.onLine;
}

function showLogin(message = "") {
  state.session = null;
  state.currentParticipant = null;
  state.participants = [];
  state.expenses = [];
  state.photoUrl = null;
  dom.appView.hidden = true;
  dom.loginView.hidden = false;
  dom.loginForm.hidden = !isConfigured();
  dom.setupNotice.hidden = isConfigured();
  dom.heroPhoto.style.backgroundImage = "";
  dom.heroPlaceholder.hidden = false;
  setInlineError(dom.loginError, message);
  dom.loginPassword.value = "";
}

function participantById(id) {
  return state.participants.find((participant) => participant.id === id);
}

function avatarElement(participant, size = "") {
  const avatar = createElement("span", `avatar${size ? ` avatar--${size}` : ""}`);
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = participant?.name?.slice(0, 1) ?? "?";

  if (participant && state.photoUrl) {
    const configuration = participant.avatar_configuration ?? {};
    avatar.style.backgroundImage = `url("${state.photoUrl}")`;
    avatar.style.backgroundSize = configuration.size ?? "300% auto";
    avatar.style.backgroundPosition = configuration.position ?? "center";
    avatar.textContent = "";
  }

  return avatar;
}

function balanceClass(balance) {
  if (balance > 0) return "is-positive";
  if (balance < 0) return "is-negative";
  return "is-zero";
}

function balanceCaption(balance) {
  if (balance > 0) return "bekommt zurück";
  if (balance < 0) return "muss noch zahlen";
  return "ausgeglichen";
}

function currentBalances() {
  return calculateBalances(
    state.participants.map((participant) => participant.id),
    state.expenses,
  );
}

function totalExpenses() {
  return state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
}

function renderBalances() {
  const balances = currentBalances();
  dom.balanceGrid.replaceChildren();

  state.participants.forEach((participant) => {
    const balance = balances[participant.id] ?? 0;
    const card = createElement("article", "balance-card");
    const top = createElement("div", "balance-card__top");
    top.append(avatarElement(participant), createElement("span", "balance-card__name", participant.name));

    const amount = createElement("strong", `balance-card__amount ${balanceClass(balance)}`, formatSignedEuro(balance));
    const caption = createElement("span", "balance-card__caption", balanceCaption(balance));
    card.append(top, amount, caption);
    dom.balanceGrid.append(card);
  });
}

function emptyCard(message) {
  const card = createElement("div", "empty-card");
  card.append(createElement("p", "", message));
  return card;
}

function expenseCard(expense, includeActions = false) {
  const card = createElement("article", "expense-card");
  const header = createElement("div", "expense-card__header");
  header.append(
    createElement("h3", "", expense.description),
    createElement("strong", "expense-card__amount", formatEuro(expense.amountCents)),
  );

  const payer = participantById(expense.payerId);
  const meta = createElement("div", "expense-card__meta");
  const payerLabel = createElement("span", "expense-payer");
  payerLabel.append(avatarElement(payer, "small"), document.createTextNode(`Bezahlt von ${payer?.name ?? "Unbekannt"}`));
  meta.append(payerLabel, createElement("time", "", DATE_FORMATTER.format(new Date(expense.createdAt))));

  const participantNames = state.participants
    .filter((participant) => expense.shares.some((share) => share.participantId === participant.id))
    .map((participant) => participant.name)
    .join(" · ");
  const involved = createElement("p", "expense-card__participants", `Für: ${participantNames}`);
  card.append(header, meta, involved);

  if (includeActions) {
    const actions = createElement("div", "expense-card__actions");
    const editButton = createElement("button", "", "Bearbeiten");
    editButton.type = "button";
    editButton.addEventListener("click", () => startEdit(expense.id));
    const deleteButton = createElement("button", "delete-action", "Löschen");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => askToDelete(expense.id));
    actions.append(editButton, deleteButton);
    card.append(actions);
  }

  return card;
}

function renderExpenses() {
  dom.recentExpenses.replaceChildren();
  dom.allExpenses.replaceChildren();
  dom.expenseCount.textContent = String(state.expenses.length);

  if (state.expenses.length === 0) {
    dom.recentExpenses.append(emptyCard("Noch keine Ausgaben. Die erste ist in wenigen Sekunden eingetragen."));
    dom.allExpenses.append(emptyCard("Sobald jemand eine Ausgabe speichert, erscheint sie hier für alle."));
    return;
  }

  state.expenses.slice(0, 5).forEach((expense) => {
    dom.recentExpenses.append(expenseCard(expense));
  });
  state.expenses.forEach((expense) => {
    dom.allExpenses.append(expenseCard(expense, true));
  });
}

function renderSettlement() {
  const balances = currentBalances();
  const settlements = calculateSettlements(balances);
  dom.settlementBalances.replaceChildren();
  dom.settlementList.replaceChildren();

  state.participants.forEach((participant) => {
    const balance = balances[participant.id] ?? 0;
    const row = createElement("div", "settlement-balance");
    const person = createElement("div", "settlement-balance__person");
    person.append(avatarElement(participant, "small"), createElement("span", "", participant.name));
    row.append(person, createElement("strong", balanceClass(balance), formatSignedEuro(balance)));
    dom.settlementBalances.append(row);
  });

  if (settlements.length === 0) {
    dom.settlementList.append(emptyCard("Alles ausgeglichen – niemand muss noch etwas überweisen."));
    return;
  }

  settlements.forEach((settlement) => {
    const from = participantById(settlement.fromId);
    const to = participantById(settlement.toId);
    const item = createElement("article", "settlement-item");
    const route = createElement("div", "settlement-route");
    route.append(
      createElement("span", "", from?.name ?? "Unbekannt"),
      createElement("span", "settlement-arrow", "→"),
      createElement("span", "", to?.name ?? "Unbekannt"),
    );
    item.append(route, createElement("strong", "", formatEuro(settlement.amountCents)));
    dom.settlementList.append(item);
  });
}

function renderAll() {
  const total = formatEuro(totalExpenses());
  dom.overviewTotal.textContent = total;
  dom.settlementTotal.textContent = total;
  renderBalances();
  renderExpenses();
  renderSettlement();
}

function personChoice(participant, type, name, checked) {
  const wrapper = createElement("div", "person-choice");
  const input = document.createElement("input");
  const inputId = `${name}-${participant.id}`;
  input.type = type;
  input.name = name;
  input.id = inputId;
  input.value = participant.id;
  input.checked = checked;

  const label = document.createElement("label");
  label.htmlFor = inputId;
  const main = createElement("span", "person-choice__main");
  main.append(avatarElement(participant, "small"), createElement("span", "person-choice__name", participant.name));
  const indicator = createElement("span", "choice-indicator", "✓");
  indicator.setAttribute("aria-hidden", "true");
  label.append(main, indicator);
  wrapper.append(input, label);
  return wrapper;
}

function renderFormChoices(payerId, beneficiaryIds) {
  const beneficiaries = new Set(beneficiaryIds);
  dom.payerOptions.replaceChildren();
  dom.beneficiaryOptions.replaceChildren();

  state.participants.forEach((participant) => {
    dom.payerOptions.append(personChoice(participant, "radio", "payer", participant.id === payerId));
    dom.beneficiaryOptions.append(personChoice(participant, "checkbox", "beneficiary", beneficiaries.has(participant.id)));
  });
}

function showScreen(screenName, { scroll = true } = {}) {
  state.activeScreen = screenName;
  dom.screens.forEach((screen) => {
    screen.hidden = screen.dataset.screen !== screenName;
  });
  dom.navButtons.forEach((button) => {
    const active = button.dataset.screenTarget === screenName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (scroll) {
    window.scrollTo({ top: dom.content.offsetTop, behavior: "smooth" });
  }
}

function startNewExpense({ focus = true } = {}) {
  state.editingExpenseId = null;
  dom.expenseForm.reset();
  clearFormErrors();
  dom.expenseTitle.textContent = "Ausgabe hinzufügen";
  dom.expenseKicker.textContent = "In wenigen Sekunden";
  dom.saveExpenseButton.textContent = "Ausgabe speichern";
  dom.cancelEditButton.hidden = true;
  renderFormChoices(
    state.currentParticipant?.id,
    state.participants.map((participant) => participant.id),
  );
  showScreen("expense");
  if (focus) window.setTimeout(() => dom.expenseAmount.focus(), 240);
}

function startEdit(expenseId) {
  const expense = state.expenses.find((item) => item.id === expenseId);
  if (!expense) return;

  state.editingExpenseId = expense.id;
  clearFormErrors();
  dom.expenseTitle.textContent = "Ausgabe bearbeiten";
  dom.expenseKicker.textContent = "Vier Angaben";
  dom.saveExpenseButton.textContent = "Änderungen speichern";
  dom.cancelEditButton.hidden = false;
  dom.expenseAmount.value = (expense.amountCents / 100).toFixed(2).replace(".", ",");
  dom.expenseDescription.value = expense.description;
  renderFormChoices(
    expense.payerId,
    expense.shares.map((share) => share.participantId),
  );
  showScreen("expense");
}

function validateExpenseForm() {
  clearFormErrors();
  const amountCents = parseEuroToCents(dom.expenseAmount.value);
  const description = dom.expenseDescription.value.trim();
  const payerId = dom.expenseForm.querySelector('input[name="payer"]:checked')?.value;
  const participantIds = [...dom.expenseForm.querySelectorAll('input[name="beneficiary"]:checked')]
    .map((input) => input.value);
  let valid = true;

  if (amountCents === null) {
    setInlineError(dom.amountError, "Bitte gib einen gültigen Betrag ein, zum Beispiel 72,40.");
    valid = false;
  } else if (amountCents <= 0) {
    setInlineError(dom.amountError, "Der Betrag muss größer als 0,00 € sein.");
    valid = false;
  } else if (amountCents > 100_000_000) {
    setInlineError(dom.amountError, "Dieser Betrag ist für die Reisekasse zu hoch.");
    valid = false;
  }

  if (!description) {
    setInlineError(dom.descriptionError, "Bitte ergänze eine kurze Beschreibung.");
    valid = false;
  }
  if (!payerId) {
    setInlineError(dom.payerError, "Bitte wähle aus, wer bezahlt hat.");
    valid = false;
  }
  if (participantIds.length === 0) {
    setInlineError(dom.beneficiaryError, "Bitte wähle mindestens eine beteiligte Person aus.");
    valid = false;
  }

  if (!valid) return null;

  return {
    id: state.editingExpenseId,
    amountCents,
    description,
    payerId,
    shares: splitAmount(amountCents, participantIds),
  };
}

async function saveExpense(event) {
  event.preventDefault();
  if (state.submitting) return;

  const expense = validateExpenseForm();
  if (!expense) return;

  state.submitting = true;
  dom.saveExpenseButton.disabled = true;
  dom.saveExpenseButton.textContent = "Wird gespeichert …";

  try {
    await state.service.saveExpense(expense);
    await loadTripData({ quiet: true });
    startNewExpense({ focus: false });
    showScreen("overview");
    showToast(expense.id ? "Änderung gespeichert." : "Ausgabe gespeichert.");
  } catch (error) {
    setInlineError(dom.formError, userMessage(error, "speichern"));
  } finally {
    state.submitting = false;
    dom.saveExpenseButton.disabled = false;
    dom.saveExpenseButton.textContent = state.editingExpenseId ? "Änderungen speichern" : "Ausgabe speichern";
  }
}

function askToDelete(expenseId) {
  state.pendingDeleteId = expenseId;
  dom.confirmDeleteButton.disabled = false;
  dom.confirmDeleteButton.textContent = "Löschen";
  dom.deleteDialog.showModal();
}

async function confirmDelete(event) {
  event.preventDefault();
  if (state.deleting || !state.pendingDeleteId) return;

  state.deleting = true;
  dom.confirmDeleteButton.disabled = true;
  dom.confirmDeleteButton.textContent = "Wird gelöscht …";
  try {
    await state.service.deleteExpense(state.pendingDeleteId);
    state.pendingDeleteId = null;
    dom.deleteDialog.close();
    await loadTripData({ quiet: true });
    showToast("Ausgabe gelöscht. Die Salden sind aktualisiert.");
  } catch (error) {
    dom.deleteDialog.close();
    showToast(userMessage(error, "löschen"));
  } finally {
    state.deleting = false;
    dom.confirmDeleteButton.disabled = false;
    dom.confirmDeleteButton.textContent = "Löschen";
  }
}

async function loadPhoto() {
  try {
    state.photoUrl = await state.service.getPrivatePhotoUrl();
    dom.heroPhoto.style.backgroundImage = `url("${state.photoUrl}")`;
    dom.heroPhoto.style.backgroundPosition = "center 53%";
    dom.heroPlaceholder.hidden = true;
  } catch (error) {
    state.photoUrl = null;
    dom.heroPhoto.style.backgroundImage = "";
    dom.heroPlaceholder.hidden = false;
    dom.heroPlaceholder.querySelector("p").textContent = userMessage(error, "foto");
  }
}

async function loadTripData({ quiet = false } = {}) {
  if (!quiet) dom.syncStatus.textContent = "Lädt …";
  try {
    const data = await state.service.loadTripData();
    state.participants = data.participants.sort((a, b) => {
      return PERSON_ORDER.indexOf(a.name) - PERSON_ORDER.indexOf(b.name);
    });
    state.expenses = data.expenses;
    state.currentParticipant = state.participants.find(
      (participant) => participant.user_id === state.session?.user?.id,
    ) ?? null;

    if (!state.currentParticipant) {
      dom.accessView.hidden = false;
      dom.nav.hidden = true;
      dom.screens.forEach((screen) => { screen.hidden = true; });
      dom.sessionName.textContent = state.session?.user?.email ?? "angemeldet";
      return false;
    }

    dom.accessView.hidden = true;
    dom.nav.hidden = false;
    dom.sessionName.textContent = state.currentParticipant.name;
    renderAll();
    if (!state.editingExpenseId) {
      renderFormChoices(
        state.currentParticipant.id,
        state.participants.map((participant) => participant.id),
      );
    }
    showScreen(state.activeScreen, { scroll: false });
    dom.syncStatus.textContent = "Aktuell";
    return true;
  } catch (error) {
    dom.syncStatus.textContent = "Nicht aktuell";
    const message = userMessage(error);
    if (message.includes("abgelaufen")) {
      showLogin(message);
    } else {
      showToast(message);
    }
    return false;
  }
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(async () => {
    dom.syncStatus.textContent = "Aktualisiert …";
    await loadTripData({ quiet: true });
    dom.syncStatus.textContent = "Aktuell";
  }, 300);
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool || state.webMcpController) return;

  const controller = new AbortController();
  state.webMcpController = controller;

  const reportRegistrationError = () => {
    controller.abort();
    state.webMcpController = null;
  };

  try {
    void Promise.resolve(context.registerTool({
      name: "read_trip_summary",
      title: "Reisekasse zusammenfassen",
      description: "Liest Gesamtausgaben und aktuelle Salden der angemeldeten Mallorca-Reise.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const balances = currentBalances();
        return {
          totalCents: totalExpenses(),
          balances: state.participants.map((participant) => ({
            name: participant.name,
            balanceCents: balances[participant.id],
          })),
        };
      },
    }, { signal: controller.signal })).catch(reportRegistrationError);

    void Promise.resolve(context.registerTool({
      name: "create_expense",
      title: "Ausgabe speichern",
      description: "Speichert eine Ausgabe für die angemeldete Mallorca-Reise und aktualisiert die sichtbaren Salden.",
      inputSchema: {
        type: "object",
        properties: {
          amountCents: { type: "integer", minimum: 1, maximum: 100000000 },
          description: { type: "string", minLength: 1, maxLength: 120 },
          payerName: { type: "string", enum: PERSON_ORDER },
          participantNames: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: { type: "string", enum: PERSON_ORDER },
          },
        },
        required: ["amountCents", "description", "payerName", "participantNames"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const amountCents = input?.amountCents;
        const description = String(input?.description ?? "").trim();
        const payer = state.participants.find((participant) => participant.name === input?.payerName);
        const participantNames = Array.isArray(input?.participantNames) ? input.participantNames : [];
        const selectedParticipants = state.participants.filter((participant) => participantNames.includes(participant.name));

        if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000 ||
            !description || description.length > 120 || !payer || selectedParticipants.length !== new Set(participantNames).size ||
            selectedParticipants.length === 0) {
          throw new TypeError("Ungültige Ausgabeangaben.");
        }

        const shares = splitAmount(amountCents, selectedParticipants.map((participant) => participant.id));
        const expenseId = await state.service.saveExpense({
          amountCents,
          description,
          payerId: payer.id,
          shares,
        });
        await loadTripData({ quiet: true });
        showToast("Ausgabe gespeichert.");
        return { expenseId, saved: true };
      },
    }, { signal: controller.signal })).catch(reportRegistrationError);
  } catch {
    reportRegistrationError();
  }
}

async function enterApp(session) {
  state.session = session;
  dom.loginView.hidden = true;
  dom.appView.hidden = false;
  dom.sessionName.textContent = session.user.email ?? "angemeldet";

  const hasAccess = await loadTripData();
  if (!hasAccess) return;

  await loadPhoto();
  renderAll();
  renderFormChoices(
    state.currentParticipant.id,
    state.participants.map((participant) => participant.id),
  );

  if (!state.channel) {
    state.channel = state.service.subscribeToChanges(scheduleRealtimeRefresh);
  }
  registerWebMcpTools();
}

async function handleLogin(event) {
  event.preventDefault();
  if (!navigator.onLine) {
    setInlineError(dom.loginError, "Du bist offline. Für die Anmeldung brauchst du eine Internetverbindung.");
    return;
  }

  const email = dom.loginEmail.value.trim();
  const password = dom.loginPassword.value;
  if (!email || !password) {
    setInlineError(dom.loginError, "Bitte gib E-Mail-Adresse und Passwort ein.");
    return;
  }

  setInlineError(dom.loginError, "");
  dom.loginButton.disabled = true;
  dom.loginButton.textContent = "Wird angemeldet …";
  try {
    const session = await state.service.signIn(email, password);
    await enterApp(session);
  } catch (error) {
    setInlineError(dom.loginError, userMessage(error, "anmelden"));
  } finally {
    dom.loginButton.disabled = false;
    dom.loginButton.textContent = "Anmelden";
  }
}

async function handleLogout() {
  dom.logoutButton.disabled = true;
  try {
    state.intentionalLogout = true;
    state.webMcpController?.abort();
    state.webMcpController = null;
    await state.service.removeChannel(state.channel);
    state.channel = null;
    await state.service.signOut();
    showLogin();
  } catch (error) {
    showToast("Die Abmeldung ist gerade nicht möglich. Bitte versuche es erneut.");
  } finally {
    state.intentionalLogout = false;
    dom.logoutButton.disabled = false;
  }
}

function bindEvents() {
  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
  dom.loginForm.addEventListener("submit", handleLogin);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.overviewAddButton.addEventListener("click", () => startNewExpense());
  dom.expenseForm.addEventListener("submit", saveExpense);
  dom.cancelEditButton.addEventListener("click", () => {
    startNewExpense({ focus: false });
    showScreen("expenses");
  });
  dom.confirmDeleteButton.addEventListener("click", confirmDelete);
  dom.expenseAmount.addEventListener("blur", () => {
    const cents = parseEuroToCents(dom.expenseAmount.value);
    if (cents !== null && cents > 0) {
      dom.expenseAmount.value = (cents / 100).toFixed(2).replace(".", ",");
    }
  });

  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.screenTarget;
      if (target === "expense") startNewExpense();
      else showScreen(target);
    });
  });

  document.querySelectorAll("[data-go-to]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.goTo));
  });
}

async function initialize() {
  bindEvents();
  updateOnlineState();

  if (!isConfigured()) {
    showLogin();
    return;
  }

  try {
    state.service = await createSupabaseService();
    const session = await state.service.getSession();

    state.service.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        const message = state.intentionalLogout ? "" : "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.";
        window.setTimeout(() => showLogin(message), 0);
      } else if (event === "TOKEN_REFRESHED" && nextSession) {
        state.session = nextSession;
      }
    });

    if (session) await enterApp(session);
    else showLogin();
  } catch (error) {
    showLogin(userMessage(error));
  }
}

initialize();
