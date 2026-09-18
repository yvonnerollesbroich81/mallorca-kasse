# Mallorca-Kasse

Eine kleine private Reisekasse für Yvonne, Alice, Birgit und Svenja. Die App läuft ohne Build-Schritt als HTML, CSS und Vanilla JavaScript auf GitHub Pages. Supabase übernimmt Anmeldung, Datenbank, Live-Aktualisierung und den privaten Speicher für das Gruppenfoto.

## Was bereits vorbereitet ist

- mobile Oberfläche mit genau vier Bereichen: Übersicht, Ausgabe, Ausgaben und Abrechnung
- Ausgabenformular mit ausschließlich Betrag, Beschreibung, zahlender Person und beteiligten Personen
- alle vier Personen sind unter „Für wen?“ standardmäßig ausgewählt
- eingeloggte Person ist standardmäßig als Zahlerin ausgewählt und kann geändert werden
- Bearbeiten und Löschen mit Sicherheitsabfrage
- Geldberechnung ausschließlich in ganzen Cent
- vollständige Cent-Verteilung bei nicht glatt teilbaren Beträgen
- möglichst wenige Ausgleichszahlungen
- automatische Aktualisierung bei Änderungen durch eine andere Teilnehmerin
- deutsche, verständliche Fehlermeldungen
- Row Level Security für alle Reisedaten
- privater Storage-Bucket und zeitlich begrenzte Bild-URL
- automatisierte Tests ohne zusätzliche Pakete
- keine Analytics, kein Tracking, keine Werbung und keine Google Fonts

## Drei wichtige technische Hinweise

### 1. Login ohne zusätzlichen Maildienst

Die in Supabase eingebaute E-Mail-Zustellung versendet Magic Links nur an E-Mail-Adressen, die Mitglied des Supabase-Projektteams sind, und ist stark begrenzt. Für vier normale Nutzerinnen wäre sonst ein zusätzlicher SMTP-Dienst nötig. Damit das Projekt bei den gewünschten drei Diensten bleibt, verwendet diese App **E-Mail + Passwort**. Die vier Konten werden einmal im Supabase-Dashboard angelegt. Ein vergessenes Passwort setzt die Projektinhaberin dort zurück.

Supabase erklärt die Einschränkung hier: [Auth-E-Mails und Standard-SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

### 2. GitHub Pages und ein öffentliches Repository

Bei GitHub Free funktioniert GitHub Pages für ein Projekt-Repository kostenlos, wenn das Repository öffentlich ist. Der HTML-, CSS- und JavaScript-Code ist daher öffentlich einsehbar. **Ausgaben, E-Mail-Adressen und das Gruppenfoto liegen nicht im Repository.** Sie bleiben durch Supabase Auth und RLS geschützt. Auch der öffentliche Supabase-Key ist absichtlich kein Geheimnis; die Sicherheit kommt von RLS.

GitHub weist außerdem darauf hin, dass Pages-Websites öffentlich erreichbar sind: [GitHub-Pages-Website erstellen](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

### 3. Kostenloser Supabase-Tarif

Die App benötigt nur Funktionen des kostenlosen Supabase-Tarifs. Keine Kreditkarte und kein automatisches Upgrade sind vorgesehen. Supabase kann wenig genutzte Free-Projekte nach einer Zeit pausieren; sie lassen sich im Dashboard wieder aktivieren. Das ist die einzige Einschränkung gegenüber „immer online“.

## Foto, Zuordnung und Gestaltung

Die verbindliche Zuordnung des hochgeladenen Fotos ist:

- vorne links: Yvonne
- vorne rechts: Alice
- hinten links: Birgit
- hinten rechts: Svenja

Die App lädt genau eine private Bilddatei aus Supabase. Für die runden Profilbilder werden keine neuen Bilder erzeugt und keine Gesichter verändert. Vier in der Datenbank gespeicherte CSS-Ausschnitte positionieren dasselbe Original unterschiedlich. Die Ausschnitte lassen sich später über `avatar_configuration` in der Tabelle `participants` anpassen.

Die zentralen Farben in `css/styles.css` wurden aus dem Foto abgeleitet:

- tiefes Palmgrün für Navigation und Hauptaktionen
- gedecktes Vegetationsgrün für positive Zustände
- warmer Sandton des Weges
- Cremeweiß für ruhige Flächen
- dunkler Naturton für gut lesbaren Text

Das Foto selbst wird **niemals** in dieses Repository kopiert.

---

# Einrichtung Schritt für Schritt

## 1. Kostenloses Supabase-Projekt anlegen

1. Öffne [supabase.com](https://supabase.com/) und melde dich an.
2. Wähle **New project**.
3. Falls gefragt, lege eine Organisation im kostenlosen Tarif an.
4. Projektname: `mallorca-kasse`.
5. Erzeuge ein starkes Datenbankpasswort und bewahre es sicher auf. Dieses Passwort kommt nicht in die App.
6. Wähle eine europäische Region in eurer Nähe.
7. Wähle ausdrücklich den **Free**-Tarif.
8. Aktiviere keine kostenpflichtige Erweiterung und hinterlege keine Kreditkarte.
9. Warte, bis das Projekt vollständig gestartet ist.

## 2. Tabellen, Prüfungen und Row Level Security anlegen

1. Öffne im Supabase-Dashboard links den **SQL Editor**.
2. Wähle **New query**.
3. Öffne in diesem Projekt die Datei `supabase/setup.sql`.
4. Kopiere den vollständigen Inhalt in den SQL Editor.
5. Klicke auf **Run**.
6. Am Ende muss die Ausführung ohne roten Fehler abgeschlossen sein.

Das SQL legt diese Tabellen an:

- `trips`: Reisen
- `participants`: Teilnehmerinnen und Zuordnung zum Auth-Konto
- `trip_versions`: geschütztes Aktualisierungssignal für alle vier Geräte
- `expenses`: Beschreibung, zahlende Person und Betrag in Cent
- `expense_participants`: beteiligte Personen und exakter Cent-Anteil

Zusätzlich werden RLS, sichere Datenbankfunktionen, Constraints und Realtime vorbereitet. Es gibt absichtlich kein Kategorie- und kein manuell eingegebenes Datumsfeld.

## 3. Die vier Auth-Konten einrichten

Wichtig: Füge Alice, Birgit und Svenja **nicht** als Mitglieder des Supabase-Projektteams hinzu. Sie brauchen nur ein normales App-Konto.

1. Öffne **Authentication → Users**.
2. Klicke **Add user → Create new user**.
3. Trage Yvonnes E-Mail-Adresse ein.
4. Vergib ein starkes Startpasswort.
5. Aktiviere, falls angezeigt, **Auto confirm user**.
6. Wiederhole das für Alice, Birgit und Svenja.
7. Übermittle jeder Teilnehmerin ihre E-Mail-Adresse und ihr Startpasswort über einen privaten Weg.

Die App legt selbst keine neuen Konten an. Dadurch kann sich eine fremde E-Mail-Adresse nicht registrieren.

## 4. Benutzerkonten mit den vier Namen verknüpfen

1. Öffne in **Authentication → Users** Yvonnes Benutzerkonto.
2. Kopiere die technische **User UID**. Sie sieht ungefähr so aus: `12345678-abcd-....`.
3. Wiederhole das für Alice, Birgit und Svenja.
4. Öffne wieder den **SQL Editor** und starte eine neue Abfrage.
5. Ersetze in diesem Block die vier Platzhalter durch die kopierten UIDs:

```sql
update public.participants
set user_id = 'YVONNE-USER-UID'
where trip_id = 'b1bf864e-1228-4fe8-8f93-e2bb909875a1' and name = 'Yvonne';

update public.participants
set user_id = 'ALICE-USER-UID'
where trip_id = 'b1bf864e-1228-4fe8-8f93-e2bb909875a1' and name = 'Alice';

update public.participants
set user_id = 'BIRGIT-USER-UID'
where trip_id = 'b1bf864e-1228-4fe8-8f93-e2bb909875a1' and name = 'Birgit';

update public.participants
set user_id = 'SVENJA-USER-UID'
where trip_id = 'b1bf864e-1228-4fe8-8f93-e2bb909875a1' and name = 'Svenja';
```

6. Klicke **Run**.
7. Prüfe die Zuordnung mit:

```sql
select name, user_id
from public.participants
order by created_at;
```

Bei allen vier Namen muss jetzt eine UID stehen. Diese Zuordnung sorgt unter anderem dafür, dass die App die eingeloggte Person als Zahlerin vorauswählt.

## 5. Privaten Storage-Bucket für das Foto anlegen

1. Öffne **Storage**.
2. Wähle **New bucket**.
3. Name exakt: `trip-photos`.
4. Die Option **Public bucket** muss ausgeschaltet bleiben. Buckets sind normalerweise standardmäßig privat.
5. Erlaube als Dateityp mindestens PNG. Eine normale Größenbegrenzung von beispielsweise 10 MB reicht für dieses Foto.
6. Erstelle den Bucket.

Private Buckets und signierte URLs sind in der offiziellen Dokumentation beschrieben: [Supabase Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## 6. Gruppenfoto geschützt hochladen

1. Benenne die bereitgestellte Datei lokal in `mallorca-gruppe.png` um.
2. Öffne den Bucket `trip-photos`.
3. Lege darin einen Ordner mit diesem exakten Namen an:

   `b1bf864e-1228-4fe8-8f93-e2bb909875a1`

4. Öffne diesen Ordner.
5. Lade dort `mallorca-gruppe.png` hoch.

Der vollständige Objektpfad lautet danach:

`b1bf864e-1228-4fe8-8f93-e2bb909875a1/mallorca-gruppe.png`

Der Bucket darf nicht öffentlich geschaltet werden. Die App erzeugt nach dem Login eine auf vier Stunden begrenzte signierte URL. Läuft sie ab, genügt ein Neuladen der App. Die Storage-RLS-Regel erlaubt diese URL nur für ein zur Reise gehörendes Auth-Konto.

## 7. Supabase URL und öffentlichen Key finden

1. Öffne im Supabase-Projekt **Project Settings → API**. Je nach aktueller Dashboard-Ansicht findest du dieselben Angaben auch über **Connect**.
2. Kopiere die **Project URL**, etwa `https://abcxyz.supabase.co`.
3. Kopiere den **Publishable key**. Bei älteren Projekten heißt er möglicherweise noch `anon public`.
4. Kopiere **niemals** einen `secret`- oder `service_role`-Key in die App.

Der Publishable/anon-Key darf im Frontend stehen. Ohne passende Anmeldung und RLS erhält er weder Reise- noch Bilddaten.

## 8. Die zwei Werte in der App eintragen

Öffne `js/config.js` und ersetze nur diese zwei Werte:

```js
supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
supabasePublishableKey: "DEIN_OEFFENTLICHER_SUPABASE_KEY",
```

Beispiel:

```js
supabaseUrl: "https://abcxyz.supabase.co",
supabasePublishableKey: "sb_publishable_...",
```

Lass `tripId`, `photoBucket` und `photoPath` unverändert.

## 9. Login-Einstellungen prüfen

1. Öffne **Authentication → Providers → Email**.
2. E-Mail/Passwort muss aktiviert sein.
3. Da die Benutzerinnen im Dashboard angelegt und bestätigt wurden, ist keine öffentliche Registrierung nötig.
4. Öffne **Authentication → URL Configuration**.
5. Trage später als **Site URL** die fertige GitHub-Pages-Adresse ein:

   `https://MEINNAME.github.io/mallorca-kasse/`

Für den gewählten Passwort-Login ist keine E-Mail-Weiterleitung nötig. Die richtige Site URL ist trotzdem eine sinnvolle sichere Grundeinstellung.

## 10. App vor dem Veröffentlichen lokal ansehen

Ein Doppelklick auf `index.html` reicht nicht zuverlässig, weil Browser JavaScript-Module unter `file://` blockieren können. Starte stattdessen im Projektordner einen kleinen lokalen Webserver, zum Beispiel wenn Python vorhanden ist:

```text
python -m http.server 8000
```

Öffne anschließend `http://localhost:8000/`.

Falls die Anmeldung lokal genutzt werden soll, kannst du `http://localhost:8000/**` zusätzlich unter **Authentication → URL Configuration → Redirect URLs** eintragen. Der spätere Betrieb benötigt Python nicht.

## 11. Kostenloses GitHub-Repository anlegen

1. Melde dich bei [github.com](https://github.com/) an.
2. Klicke oben rechts auf **+ → New repository**.
3. Repository-Name: `mallorca-kasse`.
4. Wähle für GitHub Pages im kostenlosen Tarif **Public**.
5. Aktiviere keine kostenpflichtige Funktion.
6. Erstelle das Repository möglichst leer, also ohne zusätzliche README, `.gitignore` oder Lizenz, weil diese Dateien bereits vorhanden sind.

## 12. Dateien zu GitHub übertragen

Im Projektordner ist Git bereits vorbereitet. Öffne dort ein Terminal und führe diese Befehle nacheinander aus. Ersetze `MEINNAME` durch deinen GitHub-Namen:

```text
git branch -M main
git add .
git commit -m "Mallorca-Kasse einrichten"
git remote add origin https://github.com/MEINNAME/mallorca-kasse.git
git push -u origin main
```

Kontrolliere anschließend auf GitHub, dass `index.html`, `css`, `js`, `tests`, `supabase` und `README.md` sichtbar sind. Das Gruppenfoto darf dort nicht auftauchen.

## 13. GitHub Pages aktivieren

1. Öffne auf GitHub das Repository `mallorca-kasse`.
2. Wähle **Settings → Pages**.
3. Unter **Build and deployment** wähle **Deploy from a branch**.
4. Branch: `main`.
5. Ordner: `/ (root)`.
6. Klicke **Save**.
7. Warte einige Minuten.
8. Die Adresse lautet anschließend ungefähr:

   `https://MEINNAME.github.io/mallorca-kasse/`

Alle Pfade in der App sind relativ. Deshalb funktioniert sie auch im Unterordner `/mallorca-kasse/`.

## 14. Fertige URL in Supabase eintragen

1. Kopiere die exakte GitHub-Pages-Adresse einschließlich abschließendem `/`.
2. Öffne in Supabase **Authentication → URL Configuration**.
3. Trage sie als **Site URL** ein.
4. Speichere die Änderung.

## 15. App öffnen und mit den anderen teilen

1. Öffne die GitHub-Pages-Adresse auf deinem Smartphone.
2. Melde dich mit Yvonnes E-Mail-Adresse und Passwort an.
3. Prüfe, dass oben das private Gruppenfoto erscheint und Yvonne als angemeldete Person angezeigt wird.
4. Sende dieselbe GitHub-Pages-Adresse privat an Alice, Birgit und Svenja.
5. Jede meldet sich mit dem eigenen Konto an.

Die Website-Adresse selbst ist öffentlich. Ohne gültiges Auth-Konto liefert Supabase aber weder Ausgaben noch Teilnehmerdaten oder Foto aus.

## 16. Gemeinsame Live-Aktualisierung testen

1. Öffne die App auf zwei Geräten mit zwei verschiedenen Konten.
2. Speichere auf dem ersten Gerät eine kleine Testausgabe.
3. Sie muss auf dem zweiten Gerät nach sehr kurzer Zeit erscheinen.
4. Bearbeite und lösche sie anschließend wieder.

Falls Realtime einmal nicht sofort reagiert, aktualisiert ein normales Neuladen den Stand ebenfalls.

## 17. Automatisierte Berechnungstests ausführen

Für die fertige App ist Node.js nicht nötig. Nur wenn du die Tests selbst wiederholen möchtest, installiere Node.js und führe im Projektordner aus:

```text
node --test
```

Getestet werden:

1. 100,00 € von Yvonne für alle
2. 60,00 € von Alice für drei Personen
3. 100,00 € auf drei Personen mit vollständiger Cent-Verteilung
4. mehrere Ausgaben mit wechselnden Zahlerinnen und Beteiligten
5. Neuberechnung nach Bearbeiten
6. Neuberechnung nach Löschen
7. vollständige Abschlussabrechnung auf exakt 0 Cent
8. Rundungsfälle von 1 Cent bis 10.000 Cent für ein bis vier Personen

Zusätzlich werden deutsche Euro-Eingaben wie `72,40 €` oder `1.247,80` geprüft.

## 18. Beispieldaten

Die vier im Auftrag genannten Beispielausgaben werden nur in den automatisierten Tests verwendet. Sie werden nicht in Supabase gespeichert und müssen deshalb vor dem echten Einsatz nicht gelöscht werden.

## 19. Sicherheit in einfachen Worten

- Eine nicht eingeloggte Person hat keine Leserechte und keine Schreibrechte.
- Ein eingeloggtes Konto sieht nur Reisen, denen es über `participants.user_id` zugeordnet ist.
- Ausgaben werden nicht direkt aus dem Browser in mehrere Tabellen geschrieben. Die Funktion `save_expense` prüft Mitgliedschaft, Betrag, Zahlerin, Beteiligte und die vollständige Centsumme und speichert alles gemeinsam.
- Bearbeiten und Löschen sind nur für Mitglieder derselben Reise möglich.
- Der Browser enthält ausschließlich den öffentlichen Supabase-Key.
- Der `service_role`- oder Secret-Key gehört niemals in `js/config.js`, GitHub oder einen Screenshot.
- Das Foto liegt nur in einem privaten Bucket. Die App verwendet eine befristete signierte URL.
- Es gibt keine anonymen Schreibrechte, Analytics oder Marketing-Skripte.

## 20. Spätere Änderungen mit Codex

Wenn du später etwas ändern möchtest:

1. Öffne den lokalen Ordner `mallorca-kasse` in Codex.
2. Beschreibe die gewünschte Änderung möglichst konkret.
3. Weise darauf hin, dass HTML, CSS, Vanilla JavaScript, GitHub Pages und Supabase Free beibehalten werden sollen.
4. Bitte Codex, anschließend `node --test` auszuführen.
5. Prüfe die Änderung lokal.
6. Übertrage sie mit:

```text
git add .
git commit -m "Kurze Beschreibung der Änderung"
git push
```

GitHub Pages veröffentlicht die neue Version anschließend automatisch.

---

## Wenn etwas nicht funktioniert

### „Zugang noch nicht zugeordnet“

Das Auth-Konto existiert, aber seine User UID wurde noch nicht in `participants.user_id` eingetragen. Wiederhole Schritt 4.

### Das Foto erscheint nicht

Prüfe nacheinander:

- Bucket heißt exakt `trip-photos`
- Bucket ist **nicht öffentlich**
- Ordner heißt exakt `b1bf864e-1228-4fe8-8f93-e2bb909875a1`
- Datei heißt exakt `mallorca-gruppe.png`
- `supabase/setup.sql` wurde vollständig ausgeführt
- das eingeloggte Konto ist einer Teilnehmerin zugeordnet

### Login schlägt fehl

- E-Mail-Adresse und Passwort exakt prüfen
- in **Authentication → Users** prüfen, ob das Konto existiert und bestätigt ist
- bei vergessenem Passwort im Dashboard ein neues Passwort setzen
- keine Magic-Link-Mail erwarten; diese App verwendet bewusst Passwort-Login

### Die App meldet „keine Verbindung“

Prüfe die Internetverbindung und den Status des Supabase-Projekts. Ein pausiertes Free-Projekt kann im Supabase-Dashboard wieder gestartet werden.

### Eine Änderung erscheint nicht sofort auf dem zweiten Gerät

Prüfe, ob der SQL-Teil für `supabase_realtime` ohne Fehler lief. Lade die App danach einmal neu.

## Projektstruktur

```text
index.html                 App-Oberfläche
css/styles.css             Farben, Layout und responsive Darstellung
js/app.js                  Bedienung, Ansichten und Fehlerbehandlung
js/config.js               zwei einzutragende Supabase-Werte
js/money.js                Euro-Eingabe und Cent-Verteilung
js/calculations.js         Salden und Abschlussabrechnung
js/supabase-service.js     Auth, Daten, Foto und Realtime
tests/calculations.test.mjs automatisierte Tests
supabase/setup.sql         Tabellen, RLS und sichere Funktionen
README.md                  diese Anleitung
```

## Kostenkontrolle

- GitHub Free
- GitHub Pages
- Supabase Free
- Systemschriften
- keine eigene Domain
- keine kostenpflichtige API
- kein kostenpflichtiger Bild-, Analyse- oder Maildienst

Aktiviere in GitHub oder Supabase keine kostenpflichtige Option. Für die hier vorgesehene Nutzung mit vier Personen ist kein Upgrade Bestandteil des Projekts.
