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

---

# Horde Command

A small-horde, console-style RTS prototype in one file: `horde-command/index.html`. Open it in a browser and it runs. It works with keyboard + mouse, touch (phones and tablets, either orientation) and gamepads.

- **Hordes:** up to 3 hordes of 10 goblin warriors that move and fight as groups, with waypoint queues.
- **Possession:** take direct control of any unit or your titan. The rest of its horde follows you.
- **Clans:** Stonebreakers, Emberkin and Stormcallers. Each has its own units, turret and titan, and a Crush / Pierce / Arcane vs Plate / Hide / Spirit armor triangle.
- **Economy:** smash rocks, trees and crates for gold. Capture Soul Wells and kill enemies for souls.
- **The match:** fog of war, a minimap, and an enemy AI that recruits, rebuilds, defends and raids. Destroy every enemy shrine to win.

**Touch:** tap a horde button, then tap the ground to move or tap an enemy or rock to attack. Hold to queue a waypoint. Drag to pan and pinch to zoom. Double-tap one of your units (or press Possess) to take control: your left thumb moves it and ATTACK auto-aims.
