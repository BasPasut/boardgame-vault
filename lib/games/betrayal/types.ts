export type Floor = 0 | 1 | 2; // 0=basement 1=ground 2=upper
export type Rotation = 0 | 90 | 180 | 270;
export type CardType = "item" | "omen" | "event";
export type TileType = "normal" | "item" | "omen" | "event" | "stairwell";
export type GamePhase = "explore" | "haunt" | "ended";
export type TurnPhase = "move" | "action" | "done";

export interface Doors {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

export interface TileDefinition {
  id: string;
  name: string;
  floors: Floor[];
  doors: Doors; // base orientation (rotation 0)
  type: TileType;
  description: string;
  image: string;
  isStarting?: boolean;
  floorLabel?: string; // "Must be on ground floor only" etc.
}

export interface PlacedTile {
  tile_id: string;
  floor: Floor;
  x: number;
  y: number;
  rotation: Rotation;
  doors: Doors; // effective doors after rotation
  revealed_by: string | null; // player id
}

export interface CharacterDefinition {
  id: string;
  name: string;
  image: string;
  speed: number;
  might: number;
  sanity: number;
  knowledge: number;
  // Min/max for each stat (can change via events)
  speedMin: number; speedMax: number;
  mightMin: number; mightMax: number;
  sanityMin: number; sanityMax: number;
  knowledgeMin: number; knowledgeMax: number;
  trait: { en: string; th: string }; // flavour text
}

export interface CardDefinition {
  id: string;
  name: string;
  nameTh?: string;
  type: CardType;
  image: string;
  description: string; // what it does (English)
  descriptionTh?: string; // Thai translation
  flavour?: string;
}

export interface HauntScenario {
  number: number;
  name: string;
  triggerOmen: string; // omen card id
  triggerRooms: string[]; // room tile ids — any of these trigger it
  traitorObjective: string;
  heroObjective: string;
  traitorPowers?: string[];
  heroPowers?: string[];
}

export interface PlayerGameState {
  character_id: string;
  floor: Floor;
  x: number;
  y: number;
  speed: number;
  might: number;
  sanity: number;
  knowledge: number;
  items: string[];   // card ids
  is_dead: boolean;
  is_traitor: boolean;
  // Permanent list of "floor,x,y" keys this player has already drawn a card from
  drawn_tiles: string[];
}

export interface GameEvent {
  id: string;
  timestamp: string;
  type: "move" | "tile_reveal" | "card_draw" | "omen" | "haunt" | "death" | "stat" | "system";
  player_id: string;
  message: string;
}

export interface MonsterState {
  floor: Floor;
  x: number;
  y: number;
  name: string;
  image: string;
}

export interface BetrayalGameState {
  phase: GamePhase;
  haunt_number: number | null;
  traitor_id: string | null;
  winner: "heroes" | "traitor" | null;

  placed_tiles: PlacedTile[];
  remaining_tiles: Record<Floor, string[]>; // tile ids not yet placed, per floor

  item_deck: string[];
  omen_deck: string[];
  event_deck: string[];
  item_discard: string[];
  omen_discard: string[];
  event_discard: string[];

  omen_count: number;

  turn_order: string[];        // player ids
  current_turn_index: number;
  turn_phase: TurnPhase;
  moves_used: number;

  locked_doors: string[];      // "floor,x,y,dir" — one side of a locked door connection
  restrained_players: string[]; // player IDs who lose 1 Speed this turn (rope effect)
  chilled_players: string[];   // player IDs hit by Cold Spot — lose 1 Speed until their next turn

  player_states: Record<string, PlayerGameState>;
  event_log: GameEvent[];

  haunt_objectives: { traitor: string; heroes: string } | null;
  // pending card — drawn this turn, not yet resolved
  pending_card: { type: CardType; card_id: string } | null;
  monsters: MonsterState[];
}
