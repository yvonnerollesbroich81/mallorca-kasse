import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const indexHtml = await readFile(join(root, "index.html"), "utf8");
const appJs = await readFile(join(root, "js", "app.js"), "utf8");
const configJs = await readFile(join(root, "js", "config.js"), "utf8");
const setupSql = await readFile(join(root, "supabase", "setup.sql"), "utf8");

function expenseFormMarkup() {
  const start = indexHtml.indexOf('<form id="expense-form"');
  const end = indexHtml.indexOf("</form>", start);
  return indexHtml.slice(start, end);
}

test("das Ausgabenformular hat genau vier sichtbare Eingabeblöcke", () => {
  const form = expenseFormMarkup();
  assert.equal((form.match(/class="form-block(?:\s|"|--)/g) ?? []).length, 4);
  assert.match(form, />Betrag</);
  assert.match(form, />Beschreibung</);
  assert.match(form, />Wer hat bezahlt\?</);
  assert.match(form, />Für wen\?</);
});

test("das Ausgabenformular enthält weder Datum noch Kategorien oder Zusatzfelder", () => {
  const form = expenseFormMarkup().toLowerCase();
  for (const forbidden of [
    'type="date"',
    "kategorie",
    "zahlungsart",
    "beleg",
    "notizen",
    "währungsauswahl",
  ]) {
    assert.equal(form.includes(forbidden), false, `Unerlaubtes Feld gefunden: ${forbidden}`);
  }
});

test("neue Ausgaben wählen alle Personen und die eingeloggte Zahlerin vor", () => {
  assert.match(appJs, /state\.participants\.map\(\(participant\) => participant\.id\)/);
  assert.match(appJs, /state\.currentParticipant\?\.id/);
});

test("öffentlicher Frontend-Code enthält keinen Secret- oder service_role-Key", () => {
  assert.equal(/service[_-]?role/i.test(configJs), false);
  assert.equal(/sb_secret_/i.test(configJs), false);
  assert.match(configJs, /supabasePublishableKey/);
});

test("SQL aktiviert RLS, sperrt anon und schützt den Fotozugriff", () => {
  assert.equal((setupSql.match(/enable row level security/gi) ?? []).length, 5);
  assert.match(setupSql, /revoke all on public\.trips[\s\S]+from anon/i);
  assert.match(setupSql, /bucket_id = 'trip-photos'/);
  assert.match(setupSql, /public\.can_read_trip_photo\(name\)/);
  assert.match(setupSql, /grant execute on function public\.save_expense[\s\S]+to authenticated/i);
});

test("kein Gruppenfoto oder anderes Rasterbild liegt im veröffentlichten Projekt", async () => {
  const publishDirectories = [root, join(root, "css"), join(root, "js"), join(root, "supabase")];
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  const foundImages = [];

  for (const directory of publishDirectories) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase())) {
        foundImages.push(join(directory, entry.name));
      }
    }
  }

  assert.deepEqual(foundImages, []);
});

test("alle Projekt-Assets verwenden GitHub-Pages-taugliche relative Pfade", () => {
  const localReferences = [...indexHtml.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.startsWith("data:"));
  assert.ok(localReferences.length > 0);
  assert.ok(localReferences.every((reference) => reference.startsWith("./")));
});
