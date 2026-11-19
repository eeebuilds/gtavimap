# Leonidakartan

Inofficiell, interaktiv karta över Leonida i GTA VI. Fungerar i webbläsaren på dator och mobil.

Sajten är statisk: inga byggsteg, ingen server. Öppna `index.html` via valfri webbserver
(`python3 -m http.server`) eller publicera repots rot som den är.

## Vad som finns

- Zoombar karta byggd på Rockstars officiella, utskrivbara Leonida-karta.
- Sök bland platsnamn (`data/places.json`) och bland punkter i lagren (`data/points.json`).
- Kartrutor A–M / 1–9 och skala i miles, båda enligt kartans eget rutnät och teckenförklaring.
- "Min position": en markör man sätter för hand. Sparas bara i den egna webbläsaren.
- Lager för dolda uppdrag, pengar, påskägg, trivia, samlarobjekt och butiker, med spoilerskydd.

Inte byggt än: liveposition (avläsning av spelets minikarta), plattformsval och hopkoppling dator–mobil.

## Regel: ingen punkt utan källa

Varje punkt i `data/points.json` ska gå att spåra till en publicerad källa. Sajten visar inte punkter
som saknar källa, och `python3 scripts/check_points.py` stoppar dem.

```json
{
  "id": "kort-unikt-id",
  "title": "Rubrik",
  "category": "mission | money | easter_egg | trivia | collectible | shop | other",
  "text": "Vad källan säger, på svenska. Inget utöver källan.",
  "place": "Namn ur data/places.json",
  "x": 3668, "y": 3913,
  "status": "confirmed | unconfirmed",
  "spoiler": false,
  "source": { "name": "Utgivare", "url": "https://…", "quote": "Stycket som belägger punkten, ordagrant." },
  "added": "2026-11-20"
}
```

- `x`/`y` är pixlar i den beskurna kartbilden (5378 × 7502). Ange dem bara när den exakta platsen är belagd.
  Utan `x`/`y` placeras punkten vid platsnamnet i `place` och visas som "området", inte som exakt plats.
- `status` är `confirmed` först när en etablerad källa har bekräftat fyndet i det släppta spelet.
  Rykten, läckor och trailertolkningar läggs inte in alls.
- `spoiler: true` döljer punkten tills besökaren själv slår på "Visa spoilers".
- Kopiera inte andra sajters markörsamlingar. Enskilda fakta med egen källa går bra.

## Kartbilden

`tiles/` är skuren ur Rockstars egen nedladdning ("Leonida Map – Printable" på rockstargames.com/VI/downloads).
Bygg om med `python3 scripts/build_tiles.py Leonida_Map_Poster_Printable.jpg` (kräver Pillow).
Platsnamnen i `data/places.json` är avlästa från samma karta; koordinaten är etikettens mitt.

Kartbilden tillhör Rockstar Games. Projektet är ett fanprojekt och har ingen koppling till
Rockstar Games eller Take-Two Interactive.

## Övrigt

- Kartmotor: Leaflet 1.9.4 (`vendor/leaflet`, BSD-2-licens).
- `scripts/make_preview.py` bygger en enfilsvariant av sidan för förhandsvisning.
