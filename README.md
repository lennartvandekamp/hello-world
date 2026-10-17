# Autokosten Vergelijker

Webtool die op basis van een Nederlands kenteken de autokosten per maand berekent. Je kunt auto's opslaan en
tot vier opgeslagen auto's naast elkaar vergelijken.

## Functies

- **Kenteken opzoeken** via [RDW Open Data](https://opendata.rdw.nl) (merk, model, brandstof,
  gewicht, catalogusprijs, datum eerste toelating, verbruik).
- **Kosten per maand**, opgesplitst in afschrijving, rentederving, verzekering,
  motorrijtuigenbelasting, brandstof/laden, onderhoud & reparatie en banden. Ook per km,
  vaste en variabele lasten.
- **Uitgangspunten** instellen: kilometers per jaar, hoe lang je de auto houdt, provincie,
  brandstof- en stroomprijzen, elektrisch aandeel bij plug-in hybrides, rente.
- **Gegevens aanpassen** per auto: elke schatting (aankoopprijs, verzekering, enz.) kan
  worden overschreven. Ook handmatig een auto toevoegen zonder kenteken.
- **Opslaan & vergelijken**: opgeslagen auto's blijven in de browser (localStorage) bewaard;
  vergelijking als gestapelde staafgrafiek en tabel, de laagste waarde in groen.

Alle bedragen zijn indicaties op basis van gemiddelden; het kostenmodel staat in `calc.js`.

## Gebruiken

Het is een statische site zonder build-stap. Lokaal starten:

```sh
npm start        # of: python3 -m http.server 8000
```

en open http://localhost:8000. Online zetten kan bijvoorbeeld met GitHub Pages
(Settings → Pages → deploy from branch).

## Tests

```sh
npm test
```
