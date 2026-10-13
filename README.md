# Tagesbudget

Einfache Web-App, um tägliche Ausgaben zu tracken.

**App öffnen:** https://otteluis-code.github.io/tagesbudget/

## So funktioniert das Budget

- **Montag bis Freitag:** 15 € pro Tag.
- **Wochenende (Sa + So):** 50 € Basis.
- Was du an einem Werktag **nicht** ausgibst, kommt aufs Wochenende drauf.
  Beispiel: Dienstag nur 10 € ausgegeben → Wochenende hat 55 €.
- Überziehst du an einem Werktag, wird die Differenz vom Wochenende abgezogen.
- Jeden Montag startet eine neue Woche.
- Gerechnet wird ab dem Tag, an dem du die App zum ersten Mal öffnest (oder ab deinem frühesten nachgetragenen Eintrag).

Beide Beträge lassen sich in den Einstellungen ändern.

## Ansichten

- **Heute:** Betrag eintippen, Kategorie wählen, fertig. Oben siehst du, wie viel heute noch frei ist und was fürs Wochenende angespart ist.
- **Woche:** Ausgaben pro Tag, die Wochenend-Rechnung Schritt für Schritt und wofür das Geld draufging.
- **Monat:** Kalender mit allen Tagen, Summe, Ersparnis, Durchschnitt pro Tag und Kategorien.

## Daten

Alle Daten werden nur im Browser auf dem jeweiligen Gerät gespeichert (`localStorage`), nichts wird hochgeladen.
In den Einstellungen gibt es Backup (JSON) und Export als Tabelle (CSV).

Auf dem iPhone: Seite in Safari öffnen → Teilen → **Zum Home-Bildschirm**. Dann läuft sie wie eine App, auch offline.
