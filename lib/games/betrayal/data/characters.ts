import type { CharacterDefinition } from "../types";

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "father-karras",
    name: "Father Karras",
    image: "/images/games/betrayal/characters/father-karras.png",
    speed: 3, speedMin: 2, speedMax: 6,
    might: 3, mightMin: 1, mightMax: 6,
    sanity: 5, sanityMin: 2, sanityMax: 7,
    knowledge: 5, knowledgeMin: 2, knowledgeMax: 7,
    trait: "Faith is his armour — but even armour has cracks.",
  },
  {
    id: "professor-ashwood",
    name: "Professor Ashwood",
    image: "/images/games/betrayal/characters/professor-ashwood.png",
    speed: 3, speedMin: 2, speedMax: 5,
    might: 3, mightMin: 1, mightMax: 5,
    sanity: 4, sanityMin: 1, sanityMax: 6,
    knowledge: 6, knowledgeMin: 3, knowledgeMax: 8,
    trait: "He has read every book. Some should have stayed unread.",
  },
  {
    id: "lady-blackwood",
    name: "Lady Blackwood",
    image: "/images/games/betrayal/characters/lady-blackwood.png",
    speed: 4, speedMin: 2, speedMax: 6,
    might: 4, mightMin: 2, mightMax: 6,
    sanity: 4, sanityMin: 2, sanityMax: 6,
    knowledge: 4, knowledgeMin: 2, knowledgeMax: 6,
    trait: "She has survived worse. She keeps telling herself that.",
  },
  {
    id: "sergeant-cole",
    name: "Sergeant Cole",
    image: "/images/games/betrayal/characters/sergeant-cole.png",
    speed: 4, speedMin: 2, speedMax: 6,
    might: 5, mightMin: 2, mightMax: 7,
    sanity: 3, sanityMin: 1, sanityMax: 5,
    knowledge: 3, knowledgeMin: 1, knowledgeMax: 5,
    trait: "He can fight anything. He just has to convince himself it is real.",
  },
  {
    id: "mrs-holloway",
    name: "Mrs. Holloway",
    image: "/images/games/betrayal/characters/mrs-holloway.png",
    speed: 4, speedMin: 2, speedMax: 6,
    might: 3, mightMin: 1, mightMax: 5,
    sanity: 5, sanityMin: 3, sanityMax: 7,
    knowledge: 4, knowledgeMin: 2, knowledgeMax: 6,
    trait: "She has kept this house for thirty years. She knows every door that should stay shut.",
  },
  {
    id: "madame-vesper",
    name: "Madame Vesper",
    image: "/images/games/betrayal/characters/madame-vesper.png",
    speed: 3, speedMin: 1, speedMax: 5,
    might: 3, mightMin: 1, mightMax: 5,
    sanity: 5, sanityMin: 2, sanityMax: 7,
    knowledge: 5, knowledgeMin: 3, knowledgeMax: 7,
    trait: "She already knows how this ends. She just cannot change it.",
  },
];

export function getCharacter(id: string): CharacterDefinition | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
