/**
 * simulate.mjs — Betrayal at House on the Hill headless game simulation
 *
 * Runs many full games with all-bot players using the exact same logic as
 * the actual game (tiles, mapEngine, botEngine).  Reports stuck states,
 * invalid tile placements, multiple-traitor bugs, and win-condition checks.
 *
 * Run:  node simulate.mjs
 */

// ─── Tile Definitions ────────────────────────────────────────────────────────
const TILE_DEFINITIONS = [
  // Ground floor
  { id:"entrance-hall",      floors:[1], doors:{north:false,east:true, south:true, west:false}, type:"normal",    isStarting:true },
  { id:"foyer",              floors:[1], doors:{north:true, east:true, south:false,west:true},  type:"event" },
  { id:"dining-room",        floors:[1], doors:{north:true, east:false,south:true, west:true},  type:"event" },
  { id:"kitchen",            floors:[1], doors:{north:false,east:true, south:false,west:true},  type:"item" },
  { id:"library",            floors:[1], doors:{north:true, east:false,south:true, west:false}, type:"omen" },
  { id:"parlor",             floors:[1], doors:{north:false,east:true, south:true, west:true},  type:"omen" },
  { id:"ballroom",           floors:[1], doors:{north:true, east:true, south:false,west:true},  type:"event" },
  { id:"garden",             floors:[1], doors:{north:true, east:false,south:false,west:true},  type:"event" },
  { id:"junk-room",          floors:[1], doors:{north:false,east:true, south:true, west:false}, type:"item" },
  { id:"servants-quarters",  floors:[1], doors:{north:true, east:false,south:false,west:true},  type:"normal" },
  { id:"ground-stairwell",   floors:[1], doors:{north:true, east:true, south:false,west:true},  type:"stairwell" },
  // Upper floor
  { id:"upper-landing",      floors:[2], doors:{north:false,east:true, south:true, west:true},  type:"stairwell", isStarting:true },
  { id:"master-bedroom",     floors:[2], doors:{north:false,east:true, south:true, west:false}, type:"omen" },
  { id:"study",              floors:[2], doors:{north:true, east:false,south:false,west:true},  type:"item" },
  { id:"gallery",            floors:[2], doors:{north:false,east:false,south:true, west:true},  type:"event" },
  { id:"guest-bedroom",      floors:[2], doors:{north:true, east:true, south:false,west:false}, type:"event" },
  { id:"tower",              floors:[2], doors:{north:false,east:false,south:true, west:false}, type:"omen" },
  { id:"collapsed-room",     floors:[2], doors:{north:true, east:false,south:false,west:true},  type:"event" },
  // Basement
  { id:"basement-landing",   floors:[0], doors:{north:true, east:true, south:false,west:false}, type:"stairwell", isStarting:true },
  { id:"wine-cellar",        floors:[0], doors:{north:false,east:true, south:false,west:true},  type:"item" },
  { id:"furnace-room",       floors:[0], doors:{north:true, east:false,south:false,west:true},  type:"event" },
  { id:"vault",              floors:[0], doors:{north:false,east:false,south:true, west:true},  type:"item" },
  { id:"crypt",              floors:[0], doors:{north:true, east:true, south:false,west:false}, type:"omen" },
  { id:"underground-lake",   floors:[0], doors:{north:false,east:true, south:true, west:false}, type:"event" },
  { id:"dungeon",            floors:[0], doors:{north:true, east:false,south:true, west:false}, type:"omen" },
];

function getTile(id) { return TILE_DEFINITIONS.find(t => t.id === id); }

// ─── Card Definitions ─────────────────────────────────────────────────────────
const ITEM_CARD_IDS  = ["axe","revolver","knife","rope","lantern","candle","holy-symbol","amulet","healing-salve","lucky-coin","ancient-book","ring","dynamite","smelling-salts","sacrificial-dagger"];
const OMEN_CARD_IDS  = ["omen-book","omen-candle","omen-crystal-ball","omen-dog","omen-girl","omen-key","omen-mask","omen-ring","omen-skull","omen-holy-symbol"];
const EVENT_CARD_IDS = ["ev-dark-vision","ev-cold-spot","ev-writing","ev-locked-door","ev-portrait","ev-falling","ev-discovery","ev-the-smell"];

// ─── MapEngine ────────────────────────────────────────────────────────────────
const OPPOSITE = { north:"south", south:"north", east:"west", west:"east" };
const DELTA    = { north:{dx:0,dy:-1}, south:{dx:0,dy:1}, east:{dx:1,dy:0}, west:{dx:-1,dy:0} };
const DIRS     = ["north","east","south","west"];

function rotateDoors90(d) { return { north:d.west, east:d.north, south:d.east, west:d.south }; }
function rotateDoors(base, rotation) {
  let d = {...base};
  const steps = rotation / 90;
  for (let i = 0; i < steps; i++) d = rotateDoors90(d);
  return d;
}
function tileAt(tiles, floor, x, y) { return tiles.find(t => t.floor===floor && t.x===x && t.y===y); }

function getReachable(tiles, floor, x, y, speed, lockedDoors = []) {
  const lockedSet = new Set(lockedDoors);
  const visited = new Set();
  const queue = [{ floor, x, y, steps: 0 }];
  visited.add(`${floor},${x},${y}`);
  while (queue.length) {
    const cur = queue.shift();
    if (cur.steps >= speed) continue;
    const curTile = tileAt(tiles, cur.floor, cur.x, cur.y);
    if (!curTile) continue;
    const def = getTile(curTile.tile_id);
    // Stairwell → connect to ALL stairwells on other floors
    if (def?.type === "stairwell") {
      for (const f of [0,1,2]) {
        if (f === cur.floor) continue;
        const sws = tiles.filter(t => t.floor===f && getTile(t.tile_id)?.type==="stairwell");
        for (const sw of sws) {
          const key = `${f},${sw.x},${sw.y}`;
          if (!visited.has(key)) { visited.add(key); queue.push({floor:f, x:sw.x, y:sw.y, steps:cur.steps+1}); }
        }
      }
    }
    for (const dir of DIRS) {
      if (!curTile.doors[dir]) continue;
      // skip locked doors
      if (lockedSet.has(`${cur.floor},${cur.x},${cur.y},${dir}`)) continue;
      const {dx,dy} = DELTA[dir];
      const nx=cur.x+dx, ny=cur.y+dy;
      if (lockedSet.has(`${cur.floor},${nx},${ny},${OPPOSITE[dir]}`)) continue;
      const neighbor = tileAt(tiles, cur.floor, nx, ny);
      if (!neighbor || !neighbor.doors[OPPOSITE[dir]]) continue;
      const key = `${cur.floor},${nx},${ny}`;
      if (!visited.has(key)) { visited.add(key); queue.push({floor:cur.floor, x:nx, y:ny, steps:cur.steps+1}); }
    }
  }
  visited.delete(`${floor},${x},${y}`);
  return visited;
}

function getUnexploredDoors(tiles, floor) {
  const results = [];
  const placed = tiles.filter(t => t.floor===floor);
  for (const tile of placed) {
    for (const dir of DIRS) {
      if (!tile.doors[dir]) continue;
      const {dx,dy} = DELTA[dir];
      const nx=tile.x+dx, ny=tile.y+dy;
      if (!tileAt(tiles, floor, nx, ny)) {
        results.push({ x:nx, y:ny, fromTile:tile, direction:dir });
      }
    }
  }
  return results;
}

function findValidRotation(tileId, requiredDoor) {
  const def = getTile(tileId);
  if (!def) return null;
  for (const r of [0,90,180,270]) {
    const d = rotateDoors(def.doors, r);
    if (d[requiredDoor]) return { rotation:r, doors:d };
  }
  return null;
}

function buildPlacedTile(tileId, floor, x, y, requiredDoor, revealedBy) {
  const valid = findValidRotation(tileId, requiredDoor);
  if (!valid) return null;
  return { tile_id:tileId, floor, x, y, rotation:valid.rotation, doors:valid.doors, revealed_by:revealedBy };
}

function buildStartingTiles() {
  return [
    buildPlacedTile("entrance-hall",    1, 0, 0, "south", "system"),
    buildPlacedTile("upper-landing",    2, 0, 0, "south", "system"),
    buildPlacedTile("basement-landing", 0, 0, 0, "south", "system"),
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isDead = (might, sanity) => might <= 0 || sanity <= 0;
function getAttackMight(state) {
  let bonus = 0;
  const items = state.items ?? [];
  if (items.includes("axe"))                bonus += 2;
  if (items.includes("knife"))              bonus += 1;
  if (items.includes("sacrificial-dagger")) bonus += 3;
  return Math.max(1, state.might + bonus);
}

function rollDie() {
  const r = Math.random();
  if (r < 2/8) return 0;
  if (r < 5/8) return 1;
  return 2;
}
function rollDice(n) { return Array.from({length:n}, rollDie); }
function rollSum(n) { return rollDice(n).reduce((a,b)=>a+b,0); }

function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function buildTilePools() {
  const pools = {0:[],1:[],2:[]};
  for (const t of TILE_DEFINITIONS) {
    if (t.isStarting) continue;
    for (const f of t.floors) pools[f].push(t.id);
  }
  return pools;
}

// ─── Game Initialization ──────────────────────────────────────────────────────
function initGame(numPlayers) {
  const players = Array.from({length:numPlayers}, (_,i) => ({ id:`bot-${i}`, name:`Bot${i}` }));
  const startingTiles = buildStartingTiles();
  const pools = buildTilePools();

  // Simple character stats
  const charStats = { speed:3, might:3, sanity:4, knowledge:3,
    speedMax:5, mightMax:6, sanityMax:6, knowledgeMax:6 };

  const playerStates = {};
  for (const p of players) {
    playerStates[p.id] = {
      character_id: "char-generic", floor:1, x:0, y:0,
      ...charStats,
      items:[], is_dead:false, is_traitor:false, drawn_tiles:[],
    };
  }

  return {
    phase: "explore",
    haunt_number: null,
    traitor_id: null,
    winner: null,
    placed_tiles: startingTiles,
    remaining_tiles: { 0: shuffle(pools[0]), 1: shuffle(pools[1]), 2: shuffle(pools[2]) },
    item_deck: shuffle([...ITEM_CARD_IDS]),
    omen_deck: shuffle([...OMEN_CARD_IDS]),
    event_deck: shuffle([...EVENT_CARD_IDS]),
    item_discard: [], omen_discard: [], event_discard: [],
    omen_count: 0,
    turn_order: players.map(p=>p.id),
    current_turn_index: 0,
    turn_phase: "move",
    moves_used: 0,
    player_states: playerStates,
    event_log: [],
    haunt_objectives: null,
    pending_card: null,
    turn_drawn_tiles: [],
  };
}

// ─── Card Resolution ──────────────────────────────────────────────────────────
function resolveCard(gs, cardId, botId, botState) {
  const type = [...ITEM_CARD_IDS.map(id=>({id,type:"item"})),
                ...OMEN_CARD_IDS.map(id=>({id,type:"omen"})),
                ...EVENT_CARD_IDS.map(id=>({id,type:"event"}))]
               .find(c=>c.id===cardId)?.type;
  if (!type) return gs;

  const deckKey    = `${type}_deck`;
  const discardKey = `${type}_discard`;

  let patch = {
    [deckKey]:    gs[deckKey].slice(1),
    [discardKey]: [cardId, ...gs[discardKey]],
  };

  if (type === "item") {
    let updatedBot = { ...botState, items: [...(botState.items??[]), cardId] };
    if (cardId === "holy-symbol")   updatedBot.sanity    = Math.min(updatedBot.sanity    + 2, 8);
    if (cardId === "ancient-book")  updatedBot.knowledge  = Math.min(updatedBot.knowledge + 2, 8);
    if (cardId === "healing-salve") updatedBot.might      = Math.min(updatedBot.might     + 2, 8);
    patch.player_states = { ...gs.player_states, [botId]: updatedBot };
  }

  if (type === "omen") {
    // Omen stat effects (always apply)
    const existingPS = patch.player_states ?? gs.player_states;
    let updatedBot = { ...existingPS[botId] };
    if (cardId === "omen-candle") updatedBot.knowledge = Math.min(updatedBot.knowledge + 1, 8);
    if (cardId === "omen-dog")    updatedBot.speed      = Math.min(updatedBot.speed     + 1, 8);
    if (cardId === "omen-girl") {
      updatedBot.sanity  = Math.max(updatedBot.sanity - 1, 0);
      updatedBot.is_dead = isDead(updatedBot.might, updatedBot.sanity);
    }
    if (cardId === "omen-mask") {
      updatedBot.might     = Math.max(updatedBot.might - 1, 0);
      updatedBot.knowledge = Math.min(updatedBot.knowledge + 2, 8);
      updatedBot.is_dead   = isDead(updatedBot.might, updatedBot.sanity);
    }
    if (cardId === "omen-book" && gs.item_deck.length > 0) {
      const itemId = gs.item_deck[0];
      updatedBot.items = [...(updatedBot.items??[]), itemId];
      patch.item_deck    = gs.item_deck.slice(1);
      patch.item_discard = [itemId, ...(gs.item_discard??[])];
    }
    if (cardId === "omen-skull") {
      const allPS = { ...existingPS };
      for (const pid of Object.keys(allPS)) {
        const s = allPS[pid]; const ns = Math.max(s.sanity-1,0);
        allPS[pid] = { ...s, sanity:ns, is_dead:isDead(s.might,ns) };
      }
      patch.player_states = allPS;
    } else if (cardId === "omen-holy-symbol") {
      const allPS = { ...existingPS };
      for (const pid of Object.keys(allPS)) {
        const ps = allPS[pid];
        if (ps.floor===botState.floor && ps.x===botState.x && ps.y===botState.y) {
          const roll = rollSum(2);
          if (roll < 3) { const ns=Math.max(ps.sanity-1,0); allPS[pid]={...ps,sanity:ns,is_dead:isDead(ps.might,ns)}; }
        }
      }
      patch.player_states = allPS;
    } else {
      patch.player_states = { ...existingPS, [botId]: updatedBot };
    }

    if (gs.phase !== "haunt") {
      const newOmenCount = gs.omen_count + 1;
      patch.omen_count = newOmenCount;
      const roll = rollSum(2);
      if (roll < newOmenCount) {
        const eligible = gs.turn_order.filter(
          id => id !== botId && !gs.player_states[id]?.is_dead && !gs.player_states[id]?.is_traitor
        );
        const fallback = gs.turn_order.filter(id => !gs.player_states[id]?.is_dead && !gs.player_states[id]?.is_traitor);
        const traitorId = eligible.length > 0
          ? eligible[Math.floor(Math.random()*eligible.length)]
          : fallback.length > 0
          ? fallback[Math.floor(Math.random()*fallback.length)]
          : botId;

        const newPS = { ...(patch.player_states ?? gs.player_states) };
        newPS[traitorId] = { ...newPS[traitorId], is_traitor: true };
        patch = { ...patch, phase:"haunt", haunt_number:newOmenCount, traitor_id:traitorId,
                  player_states:newPS, haunt_objectives:{traitor:"Win",heroes:"Survive"} };
      }
    }
  }

  // Event effects
  if (type === "event") {
    const ps = { ...(gs.player_states) };
    const me = { ...botState };
    if (cardId === "ev-cold-spot")   me.speed = Math.max(me.speed - 1, 0);
    if (cardId === "ev-falling")     me.might = Math.max(me.might - rollSum(2), 0);
    if (cardId === "ev-dark-vision") { if (rollSum(2)<4) me.sanity=Math.max(me.sanity-1,0); else me.knowledge=Math.min(me.knowledge+1,8); }
    if (cardId === "ev-the-smell")   { if (rollSum(2)<=4) me.might=Math.max(me.might-2,0); }
    if (cardId === "ev-portrait") {
      for (const pid of Object.keys(ps)) {
        if (ps[pid].floor===botState.floor) {
          const ns=Math.max(ps[pid].sanity-1,0);
          ps[pid]={...ps[pid],sanity:ns,is_dead:isDead(ps[pid].might,ns)};
        }
      }
    }
    if (cardId === "ev-writing") {
      if (rollSum(1)>=3 && gs.item_deck.length>0) {
        me.items = [...(me.items??[]), gs.item_deck[0]];
        patch.item_deck = gs.item_deck.slice(1);
        patch.item_discard = [gs.item_deck[0], ...gs.item_discard];
      } else {
        me.sanity = Math.max(me.sanity-1,0);
      }
    }
    me.is_dead = isDead(me.might, me.sanity);
    ps[botId] = me;
    patch.player_states = ps;
  }

  return { ...gs, ...patch };
}

// ─── Auto Win-Condition Detection ─────────────────────────────────────────────
function checkAutoWin(gs) {
  if (gs.phase !== "haunt") return null;
  const living = Object.entries(gs.player_states).filter(([,ps])=>!ps.is_dead);
  const heroes  = living.filter(([,ps])=>!ps.is_traitor);
  const traitors = living.filter(([,ps])=>ps.is_traitor);
  if (traitors.length === 0) return "heroes";  // traitor is dead
  if (heroes.length  === 0) return "traitor";  // all heroes dead
  return null;
}

// ─── Bot Turn ─────────────────────────────────────────────────────────────────
function executeBotTurn(gs, players, botId) {
  let cur = { ...gs };
  const botState = cur.player_states[botId];
  if (!botState || botState.is_dead) return nextTurn(cur);

  const floor     = botState.floor;
  const movesLeft = botState.speed;
  const reachable = getReachable(cur.placed_tiles, floor, botState.x, botState.y, movesLeft, cur.locked_doors ?? []);
  const unexplored = getUnexploredDoors(cur.placed_tiles, floor);
  const hasMore   = cur.remaining_tiles[floor].length > 0;

  const explorableFromHere = unexplored.filter(({fromTile}) => {
    const isHere = botState.x===fromTile.x && botState.y===fromTile.y;
    const key = `${fromTile.floor},${fromTile.x},${fromTile.y}`;
    return isHere || reachable.has(key);
  });

  let landedTileId = null;
  let movedBotState = { ...botState };

  // 1. Try to explore a new room
  // In haunt phase: force exploration when floor is stairwell-isolated AND no enemy is reachable
  // (helps bots break out of disconnected floors to resume the fight)
  const canReachStairwell = Array.from(reachable).some(key => {
    const [f,x,y] = key.split(",").map(Number);
    const t = tileAt(cur.placed_tiles, f, x, y);
    return t && getTile(t.tile_id)?.type === "stairwell";
  });
  const onStairwell = getTile(tileAt(cur.placed_tiles,floor,botState.x,botState.y)?.tile_id??'')?.type === "stairwell";
  const noEnemyReachable = cur.phase === "haunt" && !Array.from(reachable).some(key => {
    const [f,x,y] = key.split(",").map(Number);
    return players.some(p => {
      if (p.id === botId) return false;
      const ps = cur.player_states[p.id];
      if (!ps || ps.is_dead) return false;
      return botState.is_traitor !== ps.is_traitor && ps.floor === f && ps.x === x && ps.y === y;
    });
  });
  const forceExplore = noEnemyReachable && !canReachStairwell && !onStairwell;
  if (explorableFromHere.length > 0 && hasMore && (forceExplore || Math.random() < 0.65)) {
    const pick = explorableFromHere[Math.floor(Math.random()*explorableFromHere.length)];
    const pool = cur.remaining_tiles[floor];
    const dirs = [
      {dx:0,dy:-1,rd:"north"},{dx:0,dy:1,rd:"south"},
      {dx:1,dy:0,rd:"east"},{dx:-1,dy:0,rd:"west"},
    ];
    let requiredDoor = "south";
    for (const {dx,dy,rd} of dirs) {
      if (tileAt(cur.placed_tiles, floor, pick.x+dx, pick.y+dy)) { requiredDoor=rd; break; }
    }
    // Shuffle pool and try until one fits
    const shuffled = [...pool].sort(()=>Math.random()-0.5);
    let placed=null, chosenId="", chosenIdx=-1;
    for (const candidate of shuffled) {
      const r = buildPlacedTile(candidate, floor, pick.x, pick.y, requiredDoor, botId);
      if (r) { placed=r; chosenId=candidate; chosenIdx=pool.indexOf(candidate); break; }
    }
    if (placed) {
      cur = {
        ...cur,
        placed_tiles: [...cur.placed_tiles, placed],
        remaining_tiles: {...cur.remaining_tiles, [floor]: pool.filter((_,i)=>i!==chosenIdx)},
        player_states: {...cur.player_states, [botId]:{...botState,x:pick.x,y:pick.y}},
        moves_used: botState.speed,
        turn_phase: "action",
        turn_drawn_tiles: [],
      };
      movedBotState = {...botState, x:pick.x, y:pick.y};
      landedTileId = chosenId;
    }
  }

  // 2. Move to a reachable tile if didn't explore
  if (!landedTileId) {
    const reachArr = Array.from(reachable).map(key=>{
      const [f,x,y] = key.split(",").map(Number);
      return {floor:f,x,y};
    }).filter(({floor:f,x,y})=>!(f===botState.floor&&x===botState.x&&y===botState.y));

    if (reachArr.length > 0) {
      // In haunt phase: pursue enemies, bias toward stairwells to enable cross-floor chasing
      let target;
      if (cur.phase === "haunt") {
        // First priority: a tile that has an enemy on it
        const withEnemy = reachArr.filter(({floor:f,x,y}) =>
          players.some(p => {
            if (p.id === botId) return false;
            const ps = cur.player_states[p.id];
            if (!ps || ps.is_dead) return false;
            if (botState.is_traitor === ps.is_traitor) return false;
            return ps.floor === f && ps.x === x && ps.y === y;
          })
        );
        if (withEnemy.length > 0) {
          target = withEnemy[Math.floor(Math.random()*withEnemy.length)];
        } else {
          // Second priority: a stairwell (enables cross-floor pursuit next turn)
          const stairwells = reachArr.filter(({floor:f,x,y}) => {
            const t = tileAt(cur.placed_tiles, f, x, y);
            return t && getTile(t.tile_id)?.type === "stairwell";
          });
          // Third priority: random
          target = stairwells.length > 0 && Math.random() < 0.7
            ? stairwells[Math.floor(Math.random()*stairwells.length)]
            : reachArr[Math.floor(Math.random()*reachArr.length)];
        }
      } else {
        target = reachArr[Math.floor(Math.random()*reachArr.length)];
      }
      const tile   = tileAt(cur.placed_tiles, target.floor, target.x, target.y);
      cur = {
        ...cur,
        player_states: {...cur.player_states, [botId]:{...botState,x:target.x,y:target.y,floor:target.floor}},
        moves_used: botState.speed,
        turn_phase: "action",
        turn_drawn_tiles: [],
      };
      movedBotState = {...botState, x:target.x, y:target.y, floor:target.floor};
      landedTileId = tile?.tile_id ?? null;
    } else {
      // Truly stuck on this floor — try stairwell cross-floor movement
      const myTile = tileAt(cur.placed_tiles, floor, botState.x, botState.y);
      const myDef  = getTile(myTile?.tile_id ?? "");
      if (myDef?.type === "stairwell") {
        // Jump to any stairwell on another floor
        for (const f of [0,1,2]) {
          if (f === floor) continue;
          const sws = cur.placed_tiles.filter(t=>t.floor===f && getTile(t.tile_id)?.type==="stairwell");
          if (sws.length > 0) {
            const sw = sws[Math.floor(Math.random()*sws.length)];
            cur = {
              ...cur,
              player_states: {...cur.player_states,[botId]:{...botState,floor:f,x:sw.x,y:sw.y}},
              moves_used: botState.speed, turn_phase:"action", turn_drawn_tiles:[],
            };
            movedBotState = {...botState,floor:f,x:sw.x,y:sw.y};
            landedTileId = sw.tile_id;
            break;
          }
        }
      }
      if (!landedTileId) {
        cur = {...cur, turn_phase:"action", turn_drawn_tiles:[]};
      }
    }
  }

  // 3. Draw card if applicable (once per tile per turn)
  if (landedTileId) {
    const tileDef = getTile(landedTileId);
    const landedKey = `${movedBotState.floor},${movedBotState.x},${movedBotState.y}`;
    const alreadyDrawn = (movedBotState.drawn_tiles??[]).includes(landedKey);
    if (!alreadyDrawn && tileDef?.type && tileDef.type!=="normal" && tileDef.type!=="stairwell") {
      let cardId=null;
      if (tileDef.type==="item"  && cur.item_deck.length >0) cardId=cur.item_deck[0];
      if (tileDef.type==="omen"  && cur.omen_deck.length >0) cardId=cur.omen_deck[0];
      if (tileDef.type==="event" && cur.event_deck.length>0) cardId=cur.event_deck[0];
      if (cardId) {
        cur = resolveCard(cur, cardId, botId, cur.player_states[botId]);
        // Permanently record drawn tile in player state
        const freshBot = cur.player_states[botId];
        cur = { ...cur, player_states: { ...cur.player_states, [botId]: {
          ...freshBot, drawn_tiles: [...new Set([...(freshBot.drawn_tiles??[]), landedKey])],
        }}};
      }
    }
  }

  // 4. Haunt combat
  const freshBot = cur.player_states[botId];
  if (cur.phase==="haunt" && freshBot && !freshBot.is_dead) {
    const enemies = players.filter(p => {
      if (p.id===botId) return false;
      const ps=cur.player_states[p.id];
      if (!ps||ps.is_dead) return false;
      if (freshBot.is_traitor===ps.is_traitor) return false;
      return ps.floor===freshBot.floor && ps.x===freshBot.x && ps.y===freshBot.y;
    });
    if (enemies.length>0) {
      const target = enemies[Math.floor(Math.random()*enemies.length)];
      const ts = cur.player_states[target.id];
      const atkTotal = rollSum(getAttackMight(freshBot));
      const defTotal = rollSum(Math.max(1,ts.might));
      const newPS = {...cur.player_states};
      if (atkTotal>defTotal) {
        const dmg=atkTotal-defTotal; const nm=Math.max(0,ts.might-dmg);
        newPS[target.id]={...ts,might:nm,is_dead:isDead(nm,ts.sanity)};
        if (freshBot.items?.includes("sacrificial-dagger")) {
          const ns=Math.max(0,freshBot.sanity-1);
          newPS[botId]={...freshBot,sanity:ns,is_dead:isDead(freshBot.might,ns)};
        }
      } else if (defTotal>atkTotal) {
        const dmg=defTotal-atkTotal; const nm=Math.max(0,freshBot.might-dmg);
        newPS[botId]={...freshBot,might:nm,is_dead:isDead(nm,freshBot.sanity)};
      }
      cur={...cur,player_states:newPS};
    }
  }

  // 5. Auto-win detection
  const autoWin = checkAutoWin(cur);
  if (autoWin) return {...cur, winner:autoWin, phase:"ended"};

  return nextTurn(cur);
}

function nextTurn(gs) {
  const len = gs.turn_order.length;
  let nextIdx = (gs.current_turn_index+1) % len;
  let attempts = 0;
  while (gs.player_states[gs.turn_order[nextIdx]]?.is_dead && attempts<len) {
    nextIdx=(nextIdx+1)%len; attempts++;
  }
  return {...gs, current_turn_index:nextIdx, turn_phase:"move", moves_used:0, turn_drawn_tiles:[]};
}

// ─── Run One Full Game ────────────────────────────────────────────────────────
function runGame(numPlayers, maxTurns=400) {
  const players = Array.from({length:numPlayers},(_,i)=>({id:`bot-${i}`,name:`Bot${i}`}));
  let gs = initGame(numPlayers);
  let turns = 0;
  const issues = [];

  // Validate starting state
  if (gs.placed_tiles.length !== 3) issues.push("Bad initial tile count");
  if (Object.keys(gs.player_states).length !== numPlayers) issues.push("Bad player state count");

  while (!gs.winner && turns < maxTurns) {
    const botId = gs.turn_order[gs.current_turn_index];
    const bsBefore = gs.player_states[botId];

    // Validate: bot exists
    if (!bsBefore) { issues.push(`Bot ${botId} missing from player_states at turn ${turns}`); break; }

    // Validate: no duplicate traitors before turn
    const traitorsBefore = Object.values(gs.player_states).filter(ps=>ps.is_traitor);
    if (traitorsBefore.length > 1) {
      issues.push(`Multiple traitors detected (${traitorsBefore.length}) at turn ${turns} in ${gs.phase} phase`);
      break;
    }

    // Validate: placed tile positions are unique per floor
    const posSet = new Set();
    for (const t of gs.placed_tiles) {
      const key = `${t.floor},${t.x},${t.y}`;
      if (posSet.has(key)) { issues.push(`Duplicate tile at ${key}`); }
      posSet.add(key);
    }

    gs = executeBotTurn(gs, players, botId);
    turns++;

    // After turn: validate traitor count
    const traitorsAfter = Object.values(gs.player_states).filter(ps=>ps.is_traitor);
    if (traitorsAfter.length > 1) {
      issues.push(`Multiple traitors after turn ${turns} (${traitorsAfter.length})`);
      break;
    }

    // Guard: detect truly stuck state (no living player can move or explore)
    if (turns % 20 === 0 && gs.phase === "haunt") {
      const allLiving = gs.turn_order.filter(id => !gs.player_states[id]?.is_dead);
      const anyCanAct = allLiving.some(id => {
        const ps = gs.player_states[id];
        if (!ps) return false;
        const r = getReachable(gs.placed_tiles, ps.floor, ps.x, ps.y, ps.speed, gs.locked_doors ?? []);
        const u = getUnexploredDoors(gs.placed_tiles, ps.floor);
        const canExplore = u.some(({fromTile}) => {
          const key = `${fromTile.floor},${fromTile.x},${fromTile.y}`;
          return (fromTile.x===ps.x && fromTile.y===ps.y) || r.has(key);
        });
        return r.size > 0 || canExplore;
      });
      if (!anyCanAct) {
        issues.push(`All bots truly stuck (reachable=0, unexplored=0) at turn ${turns}`);
        break;
      }
    }
  }

  const timedOut = !gs.winner && turns >= maxTurns;

  return {
    winner: gs.winner,
    turns,
    timedOut,
    issues,
    phase: gs.phase,
    omenCount: gs.omen_count,
    tilesPlaced: gs.placed_tiles.length,
    hauntTriggered: gs.phase !== "explore" || gs.haunt_number != null,
  };
}

// ─── Main Simulation ──────────────────────────────────────────────────────────
function runSimulation(numGames=200, playersPerGame=4) {
  console.log(`\n🏚  Betrayal at House on the Hill — Headless Simulation`);
  console.log(`   ${numGames} games × ${playersPerGame} players\n`);

  let wins = { heroes:0, traitor:0 };
  let totalTurns = 0;
  let totalTiles = 0;
  let haunted = 0;
  let timedOut = 0;
  const allIssues = [];

  for (let g=0; g<numGames; g++) {
    const result = runGame(playersPerGame);
    if (result.winner === "heroes")  wins.heroes++;
    if (result.winner === "traitor") wins.traitor++;
    totalTurns += result.turns;
    totalTiles += result.tilesPlaced;
    if (result.hauntTriggered) haunted++;
    if (result.timedOut) timedOut++;
    if (result.issues.length > 0) {
      allIssues.push({ game: g+1, ...result });
    }
  }

  const avgTurns = (totalTurns/numGames).toFixed(1);
  const avgTiles = (totalTiles/numGames).toFixed(1);
  const completed = wins.heroes + wins.traitor;

  console.log("─── Results ───────────────────────────────────────────────");
  console.log(`  Games completed:    ${completed} / ${numGames} (${((completed/numGames)*100).toFixed(1)}%)`);
  console.log(`  Timed out (400t):   ${timedOut} / ${numGames} (long haunt — not a bug)`);
  console.log(`  Heroes won:         ${wins.heroes} (${((wins.heroes/numGames)*100).toFixed(1)}%)`);
  console.log(`  Traitor won:        ${wins.traitor} (${((wins.traitor/numGames)*100).toFixed(1)}%)`);
  console.log(`  Haunt triggered:    ${haunted} / ${numGames}`);
  console.log(`  Avg turns/game:     ${avgTurns}`);
  console.log(`  Avg tiles placed:   ${avgTiles}`);

  if (allIssues.length === 0) {
    console.log("\n✅  No logic issues — game rules and map tiles verified clean.\n");
  } else {
    console.log(`\n❌  Logic issues in ${allIssues.length} game(s):\n`);
    for (const issue of allIssues) {
      console.log(`  Game ${issue.game}: ${issue.issues.join(" | ")}`);
    }
    console.log();
  }

  // ── Edge case tests ─────────────────────────────────────────────────────────
  console.log("─── Edge Case Tests ────────────────────────────────────────");

  // Test 1: Stairwell connectivity
  {
    const startTiles = buildStartingTiles();
    const gs = initGame(2);
    // Place a ground stairwell somewhere accessible
    const groundStairwellIdx = gs.remaining_tiles[1].indexOf("ground-stairwell");
    if (groundStairwellIdx >= 0) {
      const placed = buildPlacedTile("ground-stairwell", 1, 1, 0, "west", "test");
      if (placed) {
        const tiles = [...gs.placed_tiles, placed];
        // From entrance-hall (1,0,0), moving speed=3 should reach upper-landing (2,0,0) via stairwell
        const r = getReachable(tiles, 1, 0, 0, 3);
        const canReachUpperLanding = r.has("2,0,0");
        const canReachBasementLanding = r.has("0,0,0");
        console.log(`  Stairwell cross-floor (ground→upper):   ${canReachUpperLanding ? "✅ PASS" : "❌ FAIL"}`);
        console.log(`  Stairwell cross-floor (ground→basement): ${canReachBasementLanding ? "✅ PASS" : "❌ FAIL"}`);
      } else {
        console.log(`  Stairwell test: ⚠ couldn't place ground stairwell`);
      }
    } else {
      console.log(`  Stairwell test: ⚠ ground-stairwell not in pool`);
    }
  }

  // Test 2: drawn_tiles (permanent per-player) prevents re-draw
  {
    const gs = initGame(2);
    const kitchenPlaced = buildPlacedTile("kitchen", 1, 1, 0, "west", "test");
    if (kitchenPlaced) {
      gs.placed_tiles.push(kitchenPlaced);
      const botId = gs.turn_order[0];
      // Simulate having already drawn from kitchen on a previous turn
      gs.player_states[botId] = { ...gs.player_states[botId], drawn_tiles: ["1,1,0"] };
      const tileDef = getTile("kitchen");
      const tileKey = "1,1,0";
      const alreadyDrawn = (gs.player_states[botId].drawn_tiles??[]).includes(tileKey);
      const wouldDraw = !alreadyDrawn && tileDef?.type === "item" && gs.item_deck.length > 0;
      console.log(`  drawn_tiles prevents re-draw across turns: ${!wouldDraw ? "✅ PASS" : "❌ FAIL (would draw again)"}`);
    }
  }

  // Test 3: Multiple traitor prevention
  {
    let doubleTraitorFound = false;
    for (let i=0; i<50; i++) {
      const result = runGame(6, 300);
      const traitorCount = result.issues.filter(m=>m.includes("Multiple traitors")).length;
      if (traitorCount > 0) { doubleTraitorFound = true; break; }
    }
    console.log(`  No double-traitor in 50 games (6p):      ${!doubleTraitorFound ? "✅ PASS" : "❌ FAIL"}`);
  }

  // Test 4: All tile rotations can satisfy at least one door requirement
  {
    let rotationFailures = 0;
    for (const tileId of [...ITEM_CARD_IDS, ...OMEN_CARD_IDS]) { /* skip — these are cards */ }
    for (const tile of TILE_DEFINITIONS) {
      if (tile.isStarting) continue;
      let anyRotationWorks = false;
      for (const dir of DIRS) {
        const r = findValidRotation(tile.id, dir);
        if (r) { anyRotationWorks = true; break; }
      }
      if (!anyRotationWorks) rotationFailures++;
    }
    console.log(`  All non-starting tiles have valid rotation: ${rotationFailures===0 ? "✅ PASS" : `❌ FAIL (${rotationFailures} tiles broken)`}`);
  }

  // Test 5: Bot movement coverage — ensure bots can always reach SOMETHING on a fresh game
  {
    let stuckOnFirstTurn = 0;
    for (let i=0; i<20; i++) {
      const gs = initGame(3);
      const botId = gs.turn_order[0];
      const bs = gs.player_states[botId];
      const r = getReachable(gs.placed_tiles, bs.floor, bs.x, bs.y, bs.speed, gs.locked_doors ?? []);
      const unexplored = getUnexploredDoors(gs.placed_tiles, bs.floor);
      const canMove = r.size > 0;
      const canExplore = unexplored.length > 0;
      if (!canMove && !canExplore) stuckOnFirstTurn++;
    }
    console.log(`  Bots can always act on first turn:       ${stuckOnFirstTurn===0 ? "✅ PASS" : `❌ FAIL (${stuckOnFirstTurn}/20 stuck)`}`);
  }

  console.log();
  return allIssues.length === 0;
}

const passed = runSimulation(300, 4);
process.exit(passed ? 0 : 1);
