import { FIRST_SHADOWS_ROLES, getRolesByType } from "./roles";
import { Role } from "@/types/game";

export interface Script {
  id: string;
  name: { en: string; th: string };
  description: { en: string; th: string };
  roles: Role[];
  minPlayers: number;
  maxPlayers: number;
}

export const THE_FIRST_SHADOWS: Script = {
  id: "the-first-shadows",
  name: { en: "The First Shadows", th: "เงามืดแรก" },
  description: {
    en: "The introductory script. Perfect for new players. A balanced mix of roles in the village of Thornwick.",
    th: "สคริปต์เริ่มต้น เหมาะสำหรับผู้เล่นใหม่ บทบาทสมดุลในหมู่บ้านธอร์นวิค",
  },
  roles: FIRST_SHADOWS_ROLES,
  minPlayers: 5,
  maxPlayers: 15,
};

export const SCRIPTS = [THE_FIRST_SHADOWS];

export const getScriptById = (id: string): Script | undefined =>
  SCRIPTS.find((s) => s.id === id);

const ROLE_COUNTS: Record<number, { townsfolk: number; outsiders: number; minions: number; demons: number }> = {
  5:  { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  6:  { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
  7:  { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
  8:  { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
  9:  { townsfolk: 5, outsiders: 2, minions: 1, demons: 1 },
  10: { townsfolk: 7, outsiders: 0, minions: 2, demons: 1 },
  11: { townsfolk: 7, outsiders: 1, minions: 2, demons: 1 },
  12: { townsfolk: 7, outsiders: 2, minions: 2, demons: 1 },
  13: { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 },
  14: { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 },
  15: { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 },
};

export const getRoleCounts = (playerCount: number) => {
  const clamped = Math.min(15, Math.max(5, playerCount));
  return ROLE_COUNTS[clamped];
};

export const assignRoles = (playerIds: string[], scriptId: string): Record<string, string> => {
  const script = getScriptById(scriptId);
  if (!script) throw new Error(`Script ${scriptId} not found`);

  const counts = getRoleCounts(playerIds.length);
  const townsfolk = getRolesByType("townsfolk").slice(0, counts.townsfolk);
  const outsiders = getRolesByType("outsider").slice(0, counts.outsiders);
  const minions = getRolesByType("minion").slice(0, counts.minions);
  const demons = getRolesByType("demon").slice(0, counts.demons);

  const rolePool = [...townsfolk, ...outsiders, ...minions, ...demons];

  for (let i = rolePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
  }

  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);

  const assignments: Record<string, string> = {};
  shuffledPlayers.forEach((playerId, i) => {
    assignments[playerId] = rolePool[i].id;
  });

  return assignments;
};
