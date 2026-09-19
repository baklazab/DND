import { create } from "zustand";

export type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
export type Scores = Record<Ability, number>;
export type AbilityMethod = "point_buy" | "standard_array" | "rolls" | "manual";
export type InventoryCategory = "weapon" | "armor" | "item" | "currency";

export type InventoryItem = { id: string; name: string; category: InventoryCategory; quantity: number; notes: string };
export type CharacterDetails = { name: string; alignment: string; description: string };
export type CharacterDraft = {
  class_id: string; species_id: string; background_id: string; level: number; ability_method: AbilityMethod;
  base_scores: Scores; background_boosts: Partial<Record<Ability, number>>;
  species_choices: Record<string, string>; equipment_choices: Record<string, string>; rolled_scores: number[];
  selected_masteries: string[]; selected_weapons: string[]; starting_equipment_choices: Record<string, string[]>; selected_spells: string[]; selected_skills: string[];
  selected_languages: string[]; details: CharacterDetails;
  armor: { base_ac: number; category: "unarmored" | "light" | "medium" | "heavy"; dexterity_cap?: number };
  shield: boolean; proficient_perception: boolean; subclass_id: string | null; general_feats: string[];
};
export type SavedCharacter = {
  id: string; name: string; species_id: string; class_id: string; background_id: string; level: number;
  base_ability_scores: Scores; background_ability_boosts: Partial<Record<Ability, number>>;
  final_ability_scores: Scores; max_hp: number; armor_class: number; proficiency_bonus: number;
  modifiers: Record<Ability, number>; initiative: number; passive_perception: number;
  inventory: InventoryItem[]; details: CharacterDetails; creation_state: CharacterDraft; updated_at: string;
  saving_throws: Record<string, { modifier: number; proficient: boolean; total: number; source: string }>;
  skill_bonuses: Record<string, { ability: string; modifier: number; proficient: boolean; total: number; source: string }>;
  proficiencies: { name: string; type: string; source: string }[];
  class_features: string[];
  species_traits: string[];
  spellcasting_stats?: { ability: string; modifier: number; save_dc: number; attack_bonus: number; cantrips_known: number; prepared_spells: number; max_spell_level: number } | null;
  spell_slots: Record<number, number>;
  origin_feat: string;
  general_feats: string[];
  selected_masteries: string[];
};

const initialScores: Scores = { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 };
const emptyDetails: CharacterDetails = { name: "", alignment: "Unaligned", description: "" };

export const newDraft = (): CharacterDraft => ({
  class_id: "fighter", species_id: "human", background_id: "soldier", level: 1, ability_method: "point_buy",
  base_scores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
  background_boosts: { strength: 2, constitution: 1 },
  species_choices: {}, equipment_choices: {}, rolled_scores: [],
  selected_masteries: ["push"], selected_weapons: [], starting_equipment_choices: {}, selected_spells: [], selected_skills: [],
  selected_languages: ["Common"], details: { ...emptyDetails }, armor: { base_ac: 16, category: "heavy", dexterity_cap: 0 },
  shield: false, proficient_perception: false, subclass_id: null, general_feats: [],
});

type CharacterStore = CharacterDraft & {
  view: "dashboard" | "wizard" | "profile"; step: number; editingId: string | null; selectedCharacter: SavedCharacter | null;
  setView: (view: CharacterStore["view"]) => void; setStep: (step: number) => void; startNew: () => void;
  startEdit: (character: SavedCharacter) => void; showProfile: (character: SavedCharacter) => void;
  setField: <K extends keyof CharacterDraft>(field: K, value: CharacterDraft[K]) => void;
  setScore: (ability: Ability, value: number) => void; setBoost: (ability: Ability, value: number) => void;
  setSpeciesChoice: (key: string, value: string) => void; setEquipmentChoice: (groupId: string, optionId: string) => void;
  rollDiceScores: () => void;
  swapScore: (ability: Ability, value: number) => void;
  resetBoosts: () => void;
  toggleMastery: (mastery: string) => void; toggleLanguage: (language: string) => void;
  toggleWeapon: (weapon: string, limit?: number) => void;
  toggleSpell: (spell: string) => void;
  toggleGeneralFeat: (featName: string, limit: number) => void;
  setDetails: (details: Partial<CharacterDetails>) => void;
};

export const useCharacterStore = create<CharacterStore>((set) => ({
  ...newDraft(), view: "dashboard", step: 1, editingId: null, selectedCharacter: null,
  setView: (view) => set({ view }), setStep: (step) => set({ step }),
  startNew: () => set({ ...newDraft(), view: "wizard", step: 1, editingId: null, selectedCharacter: null }),
  startEdit: (character) => set({ ...character.creation_state, view: "wizard", step: 1, editingId: character.id, selectedCharacter: character }),
  showProfile: (character) => set({ view: "profile", selectedCharacter: character }),
  setField: (field, value) => set({ [field]: value } as Partial<CharacterStore>),
  setScore: (ability, value) => set((state) => ({ base_scores: { ...state.base_scores, [ability]: value } })),
  setBoost: (ability, value) => set((state) => ({ background_boosts: { ...state.background_boosts, [ability]: value } })),
  setSpeciesChoice: (key, value) => set((state) => ({ species_choices: { ...state.species_choices, [key]: value } })),
  setEquipmentChoice: (groupId, optionId) => set((state) => ({ equipment_choices: { ...state.equipment_choices, [groupId]: optionId } })),
  rollDiceScores: () => {
    const roll = () => {
      const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      dice.sort((a, b) => b - a);
      return dice[0] + dice[1] + dice[2];
    };
    const rolls = Array.from({ length: 6 }, roll).sort((a, b) => b - a);
    const abilities: Ability[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
    const base_scores = {} as Scores;
    abilities.forEach((ab, i) => { base_scores[ab] = rolls[i]; });
    set({ rolled_scores: rolls, base_scores });
  },
  swapScore: (ability, value) => set((state) => {
    const otherAbility = (Object.keys(state.base_scores) as Ability[]).find((key) => key !== ability && state.base_scores[key] === value);
    const base_scores = { ...state.base_scores, [ability]: value };
    if (otherAbility) base_scores[otherAbility] = state.base_scores[ability];
    return { base_scores };
  }),
  resetBoosts: () => set({ background_boosts: {} }),
  toggleMastery: (mastery) => set((state) => ({ selected_masteries: state.selected_masteries.includes(mastery) ? state.selected_masteries.filter((item) => item !== mastery) : [...state.selected_masteries, mastery] })),
  toggleWeapon: (weapon, limit = 4) => set((state) => ({ selected_weapons: state.selected_weapons.includes(weapon) ? state.selected_weapons.filter((item) => item !== weapon) : state.selected_weapons.length >= limit ? state.selected_weapons : [...state.selected_weapons, weapon] })),
  toggleSpell: (spell) => set((state) => ({ selected_spells: state.selected_spells.includes(spell) ? state.selected_spells.filter((item) => item !== spell) : [...state.selected_spells, spell] })),
  toggleLanguage: (language) => set((state) => ({ selected_languages: state.selected_languages.includes(language) ? state.selected_languages.filter((item) => item !== language) : state.selected_languages.length >= 5 ? state.selected_languages : [...state.selected_languages, language] })),
  toggleGeneralFeat: (featName, limit) => set((state) => ({ general_feats: state.general_feats.includes(featName) ? state.general_feats.filter((item) => item !== featName) : state.general_feats.length >= limit ? state.general_feats : [...state.general_feats, featName] })),
  setDetails: (details) => set((state) => ({ details: { ...state.details, ...details } })),
}));
