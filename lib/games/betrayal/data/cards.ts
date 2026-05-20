import type { CardDefinition } from "../types";

// ─── ITEM CARDS ───────────────────────────────────────────────────────────────
export const ITEM_CARDS: CardDefinition[] = [
  { id: "axe",              type: "item", name: "Axe",             image: "/images/games/betrayal/cards/items/axe.png",            description: "+2 Might when attacking. If you roll 4+, deal +1 damage.", flavour: "Still sharp." },
  { id: "revolver",        type: "item", name: "Revolver",        image: "/images/games/betrayal/cards/items/revolver.png",        description: "Attack from any room on the same floor. One use per turn.", flavour: "Six shots. Make them count." },
  { id: "knife",           type: "item", name: "Knife",           image: "/images/games/betrayal/cards/items/knife.png",           description: "+1 Might when attacking.", flavour: "Small but final." },
  { id: "rope",            type: "item", name: "Rope",            image: "/images/games/betrayal/cards/items/rope.png",            description: "Restrain a target — they lose 1 move next turn if you win a Might roll.", flavour: "It still smells of something sweet." },
  { id: "lantern",         type: "item", name: "Lantern",         image: "/images/games/betrayal/cards/items/lantern.png",         description: "You can see all adjacent unexplored doors without entering.", flavour: "Light reveals. Light attracts." },
  { id: "candle",          type: "item", name: "Black Candle",    image: "/images/games/betrayal/cards/items/candle.png",          description: "Add +1 to any Knowledge roll once per round.", flavour: "The flame burns wrong." },
  { id: "holy-symbol",     type: "item", name: "Holy Symbol",     image: "/images/games/betrayal/cards/items/holy-symbol.png",     description: "+2 Sanity. Monsters cannot enter your room while you hold this.", flavour: "It grows warm in the dark." },
  { id: "amulet",          type: "item", name: "Amulet",          image: "/images/games/betrayal/cards/items/amulet.png",          description: "Once per game, survive a death — drop to 1 Sanity instead.", flavour: "The eye watches back." },
  { id: "healing-salve",   type: "item", name: "Healing Salve",   image: "/images/games/betrayal/cards/items/healing-salve.png",   description: "Restore 2 Might. Discard after use.", flavour: "It smells of herbs and older things." },
  { id: "lucky-coin",      type: "item", name: "Lucky Coin",      image: "/images/games/betrayal/cards/items/lucky-coin.png",      description: "Reroll any single die once per turn.", flavour: "Both sides show the same face. Different expressions." },
  { id: "ancient-book",    type: "item", name: "Ancient Book",    image: "/images/games/betrayal/cards/items/ancient-book.png",    description: "+2 Knowledge. Draw 1 extra omen card when you enter an omen room.", flavour: "Some pages are stuck together." },
  { id: "ring",            type: "item", name: "Cursed Ring",     image: "/images/games/betrayal/cards/items/ring.png",            description: "See the character of any player in your room. Cannot be dropped.", flavour: "The gem shows something moving inside." },
  { id: "dynamite",        type: "item", name: "Dynamite",        image: "/images/games/betrayal/cards/items/dynamite.png",        description: "Destroy a door connection permanently. Everyone in the room loses 2 Might.", flavour: "The fuse is already burning." },
  { id: "smelling-salts",  type: "item", name: "Smelling Salts",  image: "/images/games/betrayal/cards/items/smelling-salts.png",  description: "Restore a player in your room to 2 Sanity. Discard after use.", flavour: "Almost too reviving." },
  { id: "sacrificial-dagger", type: "item", name: "Sacrificial Dagger", image: "/images/games/betrayal/cards/items/sacrificial-dagger.png", description: "+3 Might when attacking. Lose 1 Sanity each time you use it.", flavour: "Ancient. Hungry." },
];

// ─── OMEN CARDS ───────────────────────────────────────────────────────────────
export const OMEN_CARDS: CardDefinition[] = [
  { id: "omen-book",         type: "omen", name: "The Book",        image: "/images/games/betrayal/cards/omens/omen-book.png",         description: "Draw an item card. Then make a Haunt Roll.", flavour: "The pages turn by themselves." },
  { id: "omen-candle",       type: "omen", name: "Black Candle",    image: "/images/games/betrayal/cards/omens/omen-candle.png",       description: "+1 Knowledge permanently. Then make a Haunt Roll.", flavour: "The flame burns upside-down." },
  { id: "omen-crystal-ball", type: "omen", name: "Crystal Ball",    image: "/images/games/betrayal/cards/omens/omen-crystal-ball.png", description: "Look at the top card of any deck. Then make a Haunt Roll.", flavour: "The face inside the ball is yours." },
  { id: "omen-dog",          type: "omen", name: "Spectral Hound",  image: "/images/games/betrayal/cards/omens/omen-dog.png",          description: "Gain a companion: +1 Speed while the Hound is with you. Then make a Haunt Roll.", flavour: "Its eyes are empty white." },
  { id: "omen-girl",         type: "omen", name: "The Girl",        image: "/images/games/betrayal/cards/omens/omen-girl.png",         description: "-1 Sanity. The ghost warns you — reveal any one tile on your floor. Then make a Haunt Roll.", flavour: "She was here before the mansion." },
  { id: "omen-key",          type: "omen", name: "Skeleton Key",    image: "/images/games/betrayal/cards/omens/omen-key.png",          description: "Open any locked door or vault on the map. Then make a Haunt Roll.", flavour: "It is cold. It was not made for locks." },
  { id: "omen-mask",         type: "omen", name: "Plague Mask",     image: "/images/games/betrayal/cards/omens/omen-mask.png",         description: "-1 Might, +2 Knowledge while wearing. Then make a Haunt Roll.", flavour: "Something breathes inside it." },
  { id: "omen-ring",         type: "omen", name: "Mourning Ring",   image: "/images/games/betrayal/cards/omens/omen-ring.png",         description: "See another player's role during the Haunt. Then make a Haunt Roll.", flavour: "The inscription inside has been scratched out." },
  { id: "omen-skull",        type: "omen", name: "Skull",           image: "/images/games/betrayal/cards/omens/omen-skull.png",         description: "Every player loses 1 Sanity. Then make a Haunt Roll.", flavour: "The skull is warm." },
  { id: "omen-holy-symbol",  type: "omen", name: "Inverted Cross",  image: "/images/games/betrayal/cards/omens/omen-holy-symbol.png",  description: "All players in your room make a Sanity roll (3+) or lose 1 Sanity. Then make a Haunt Roll.", flavour: "It rotates without being touched." },
];

// ─── EVENT CARDS ──────────────────────────────────────────────────────────────
export const EVENT_CARDS: CardDefinition[] = [
  { id: "ev-dark-vision",    type: "event", name: "Dark Vision",     image: "/images/games/betrayal/cards/events/event-dark-vision.png",    description: "Roll 2 dice. On 4+: gain +1 Knowledge. On 3 or less: lose 1 Sanity.", flavour: "You see something you cannot unsee." },
  { id: "ev-cold-spot",      type: "event", name: "Cold Spot",       image: "/images/games/betrayal/cards/events/event-cold-spot.png",      description: "Lose 1 Speed until the end of your next turn. The cold follows you.", flavour: "Your breath fogs. Nobody else's does." },
  { id: "ev-writing",        type: "event", name: "Writing on the Wall", image: "/images/games/betrayal/cards/events/event-writing-on-wall.png", description: "Roll 1 die. On 3+: gain a clue (draw an item card). On 2 or less: lose 1 Sanity.", flavour: "'LEAVE NOW.' Too late." },
  { id: "ev-locked-door",    type: "event", name: "Locked Door",     image: "/images/games/betrayal/cards/events/event-locked-door.png",    description: "One door in this room is sealed. Requires Might 4+ or the Skeleton Key to open.", flavour: "Locked from the inside." },
  { id: "ev-portrait",       type: "event", name: "Screaming Portrait", image: "/images/games/betrayal/cards/events/event-portrait.png",    description: "Every player on this floor loses 1 Sanity.", flavour: "The eyes were always watching." },
  { id: "ev-falling",        type: "event", name: "Falling",         image: "/images/games/betrayal/cards/events/event-falling.png",        description: "Roll 2 dice. Lose that many Might. Minimum 0.", flavour: "Someone pushed. Or something." },
  { id: "ev-discovery",      type: "event", name: "Discovery",       image: "/images/games/betrayal/cards/events/event-discovery.png",      description: "Draw 2 item cards. Keep one, return the other to the bottom of the deck.", flavour: "The journal entry is dated today." },
  { id: "ev-the-smell",      type: "event", name: "The Smell",       image: "/images/games/betrayal/cards/events/event-the-smell.png",      description: "Roll 3 dice. On 5+: you back away in time. On 4 or less: a monster appears — lose 2 Might in the struggle.", flavour: "Something is very close." },
];

export function getCard(id: string): CardDefinition | undefined {
  return [...ITEM_CARDS, ...OMEN_CARDS, ...EVENT_CARDS].find((c) => c.id === id);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
