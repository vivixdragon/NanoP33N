# Rift Wardens TD

A Warcraft III–style maze tower defense game that runs in the browser. No build step and no dependencies.

**Play:** open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and go to http://localhost:8000.

## Mechanics (borrowed from the TD greats)
- **Free-build mazing** (WC3 maze TDs): creeps pathfind around your towers live, and you can never fully block them. A dotted line shows their route, with a preview while you place a tower.
- **Damage vs armor matrix**: Pierce, Siege, Magic and Chaos against Light, Medium, Heavy and Fortified armor.
- **Interest on banked gold** (Element TD) and **Goblin Markets**: saving gold competes with spending it.
- **Call waves early** for bonus gold, and let waves overlap (Kingdom Rush/Bloons).
- **3 upgrade levels plus a permanent branching specialization** (16 total) that costs scarce Lumber.
- **Veterancy**: towers rank up from kills.
- **Roguelike relic drafts** every 5 waves (20 relics).
- **Hero spells**: Meteor, Frost Nova and Midas Touch.
- **Wave affixes**: Armored, Hasted, Regenerating, Swarm, Warded and Titanic. Plus flyers, healers, splitters, slow-immune knights and bosses.
- **Wave Intel** shows the next 3 waves so you can plan.
- **Meta-progression**: earn Honor and spend it on permanent Talents. Three difficulties, plus Endless mode after wave 40.

## Controls
| Key | Action |
| --- | --- |
| Q W E R / A S D F / Z X C V | Command card (WC3 grid hotkeys) |
| Shift + click | Build several towers |
| Esc / right-click | Cancel / deselect |
| Space / P | Pause (you can still build while paused) |
| N | Send next wave early |
| 1 / 2 / 3 | Game speed |
| Del | Sell selected tower |
