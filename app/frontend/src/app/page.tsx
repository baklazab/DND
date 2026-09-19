"use client";

import { useEffect, useState } from "react";
import {
  Ability,
  InventoryItem,
  SavedCharacter,
  useCharacterStore,
} from "../store/useCharacterStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const abilities: Ability[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];
const labels: Record<Ability, string> = {
  strength: "Síla",
  dexterity: "Obratnost",
  constitution: "Odolnost",
  intelligence: "Inteligence",
  wisdom: "Moudrost",
  charisma: "Charisma",
};
const abilityHelp: Record<Ability, string> = {
  strength: "Útoky a poškození silovými zbraněmi; Athletics.",
  dexterity: "Iniciativa, AC, útoky obratnými zbraněmi a ranged zbraněmi.",
  constitution: "HP a záchrany na udržení koncentrace.",
  intelligence: "Arcana, History, Investigation, Nature a Religion.",
  wisdom: "Perception, Insight, Medicine, Survival a některé záchrany.",
  charisma: "Deception, Intimidation, Performance, Persuasion a kouzla.",
};
const skillHelp: Record<string, string> = {
  acrobatics: "Pohyb, rovnováha a únik z nebezpečné pozice.",
  "animal handling": "Zklidnění, ovládání nebo odhad zvířete.",
  arcana: "Znalosti magie a magických jevů.",
  athletics: "Šplh, skok, plavání a použití hrubé síly.",
  deception: "Přesvědčivé lhaní a klamání.",
  history: "Znalosti historických událostí a kultur.",
  insight: "Odhad úmyslů a pravdivosti chování.",
  intimidation: "Vyhrožování a nátlak.",
  investigation: "Hledání stop a dedukce z detailů.",
  medicine: "Rozpoznání zranění a péče o umírající.",
  nature: "Znalosti přírody, zvířat a prostředí.",
  perception: "Všímání si skrytých nebo vzdálených věcí.",
  performance: "Hudba, herectví a jiné vystupování.",
  persuasion: "Přesvědčování bez klamu nebo nátlaku.",
  religion: "Znalosti bohů, kultů a náboženských obřadů.",
  "sleight of hand": "Nenápadná manipulace s předměty.",
  stealth: "Tiché ukrytí a pohyb bez povšimnutí.",
  survival: "Stopy, orientace a přežití v divočině.",
};

const pretty = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (typeof value === "object") {
    if ("name" in value && typeof value.name === "string") return value.name;
    if ("id" in value && typeof value.id === "string") return value.id;
    return "";
  }
  return String(value);
};

const getItemSummary = (item: { id: string; name: string; category: string; quantity: number }, catalog: RuleCatalog | null): string => {
  if (!catalog) return "Položka v inventáři postavy.";

  if (item.category === "weapon") {
    const weapon = catalog.weapons.find((entry) => entry.id === item.id || entry.name.toLowerCase() === item.name.toLowerCase());
    if (weapon) {
      return `${weapon.damage} · útok: 1d20 + modifikátor, zranění: ${weapon.damage}`;
    }
    return "Zbraň pro útok a poškození v boji.";
  }

  if (item.category === "armor") {
    const armor = catalog.armor.find((entry) => entry.id === item.id || entry.name.toLowerCase() === item.name.toLowerCase());
    if (armor) {
      return `AC ${armor.base_ac}${armor.dexterity_cap !== null ? ` · max. Dex ${armor.dexterity_cap}` : ""} · chrání před poškozením`;
    }
    return "Ochranná zbroj pro zvýšení AC.";
  }

  if (item.category === "tool") {
    return "Nástroj pro dovednosti, rekvizitu nebo zásah z okolního světa.";
  }

  return "Vybavení a zásoby pro průzkum, cestování a každodenní hraní.";
};

const formatApiError = (detail: unknown): string => {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map(formatApiError).filter(Boolean);
      return parts.join(" · ");
    }
    if (detail && typeof detail === "object") {
      if ("msg" in detail && typeof detail.msg === "string") return detail.msg;
      if ("message" in detail && typeof detail.message === "string") return detail.message;
      if ("detail" in detail) return formatApiError((detail as { detail: unknown }).detail);
      const firstValue = Object.values(detail).find((value) => typeof value === "string" || Array.isArray(value) || (value && typeof value === "object"));
      if (firstValue) return formatApiError(firstValue);
    }
    return "Vybral jsi špatně zvýšení atributů. Vyber pouze jeden +2 a jeden +1.";
  };
const cost = (score: number) =>
  score < 9 ? 0 : score - 8 + (score > 13 ? score - 13 : 0);

// Mirrors backend rule_engine.py spell limit calculation so the spellcaster can enforce SRD limits live.
function computeSpellLimits(
  classId: string,
  level: number,
  spellcastingType: string | undefined,
  cantripsLevel1: number,
  castingModifier: number,
) {
  const cantripsLimit = cantripsLevel1 > 0 ? cantripsLevel1 + (level >= 4 ? 1 : 0) + (level >= 10 ? 1 : 0) : 0;
  let leveledLimit = Math.max(1, level + castingModifier);
  let maxSpellLevel = 1;
  if (spellcastingType === "full") {
    maxSpellLevel = Math.min(9, Math.ceil(level / 2));
  } else if (spellcastingType === "half") {
    maxSpellLevel = Math.min(5, Math.ceil(level / 4));
  } else if (spellcastingType === "pact") {
    maxSpellLevel = Math.min(5, Math.ceil(level / 2));
  }
  return { cantripsLimit, leveledLimit, maxSpellLevel };
}

// Ability Score Improvement / general feat slots granted at levels 4, 8, 12, 16 and 19 (SRD 2024).
const ASI_LEVELS = [4, 8, 12, 16, 19];
const generalFeatSlots = (level: number) => ASI_LEVELS.filter((lvl) => level >= lvl).length;

type DerivedStats = {
  final_scores: Record<Ability, number>;
  modifiers: Record<Ability, number>;
  max_hp: number;
  armor_class: number;
  initiative: number;
  passive_perception: number;
  proficiency_bonus: number;
  spell_slots: Record<number, number>;
  spellcasting_stats?: {
    ability: string;
    modifier: number;
    save_dc: number;
    attack_bonus: number;
    cantrips_known: number;
    prepared_spells: number;
    max_spell_level: number;
  };
  origin_feat: string;
  general_feats: string[];
  selected_languages: string[];
  selected_masteries: string[];
  subclass_id?: string;
  saving_throws: Record<string, { modifier: number; proficient: boolean; total: number; source: string }>;
  skill_bonuses: Record<string, { ability: string; modifier: number; proficient: boolean; total: number; source: string }>;
  proficiencies: { name: string; type: string; source: string }[];
  class_features: string[];
  species_traits: string[];
  calculated_inventory: InventoryItem[];
};

type RuleClass = {
  id: string;
  name: string;
  hit_die: number;
  primary_ability: Ability[];
  saving_throws: Ability[];
  weapon_mastery_count: number;
  subclass_level: number;
  proficiencies: string[];
  features: string[];
  armor_training?: string[];
  spellcasting?: string;
};

type RuleBackground = {
  id: string;
  name: string;
  allowed_ability_boosts: Ability[];
  origin_feat: string;
  skills: string[];
  tool: string;
  equipment: string[];
};

type SpeciesOption = {
  id: string;
  name: string;
  type: "skill" | "origin_feat" | "choice";
  count: number;
  description: string;
  choices?: { id: string; name: string }[];
};

type RuleSpecies = {
  id: string;
  name: string;
  size: string;
  speed: number;
  darkvision: boolean;
  traits: string[];
  options?: SpeciesOption[];
};

type RuleMastery = { id: string; name: string; summary: string };
type RuleWeapon = {
  id: string;
  name: string;
  category: string;
  damage: string;
  properties: string[];
  mastery: string;
};

type RuleArmor = {
  id: string;
  name: string;
  category: string;
  base_ac: number;
  dexterity_cap: number | null;
};

type RuleFeat = { id: string; name: string; category: string };
type RuleSpell = {
  id: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range_area: string;
  components: string[];
  duration: string;
  description: string;
  classes: string[];
};

type EquipmentItem = { id: string; name: string; category: string; quantity: number };
type EquipmentOption = { optionId: string; label: string; items: EquipmentItem[] };
type EquipmentGroup = { groupId: string; label: string; source: "class" | "background"; required: boolean; options: EquipmentOption[] };

type RuleSubclass = {
  id: string;
  class_id: string;
  name: string;
  level: number;
  description: string;
  features: string[];
};

type RuleCatalog = {
  classes: RuleClass[];
  backgrounds: RuleBackground[];
  species: RuleSpecies[];
  spells: RuleSpell[];
  masteries: RuleMastery[];
  feats: RuleFeat[];
  weapons: RuleWeapon[];
  armor: RuleArmor[];
  subclasses: RuleSubclass[];
  spellcasting: Record<string, { ability: Ability; cantrips_level_1: number; prepared_level_1?: number; prepared_level_2?: number; known_level_1?: number; known_level_2?: number }>;
  starting_equipment: {
    class_equipment: Record<string, EquipmentGroup[]>;
    background_equipment: Record<string, EquipmentGroup[]>;
  };
  class_levels: Record<string, Record<string, string[]>>;
  character_creation: {
    level_max: number;
    standard_languages: string[];
    alignment_options: string[];
    skill_choices: Record<string, { count: number; options: string[] }>;
  };
};

type ConfirmDialogState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

export default function Home() {
  const store = useCharacterStore();
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [catalog, setCatalog] = useState<RuleCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/characters`);
      if (!response.ok) throw new Error("Seznam postav se nepodařilo načíst.");
      setCharacters(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chyba připojení.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    fetch(`${API}/api/rules/catalog`)
      .then((response) => response.json())
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  if (store.view === "wizard")
    return (
      <Wizard
        catalog={catalog}
        onSaved={(character) => {
          setCharacters((items) => [
            character,
            ...items.filter((item) => item.id !== character.id),
          ]);
          store.showProfile(character);
        }}
      />
    );

  if (store.view === "profile" && store.selectedCharacter)
    return (
      <>
        <Profile
          character={store.selectedCharacter}
          catalog={catalog}
          onChanged={(character) => {
            setCharacters((items) =>
              items.map((item) => (item.id === character.id ? character : item)),
            );
            store.showProfile(character);
          }}
          onDeleted={(id) => {
            setCharacters((items) => items.filter((item) => item.id !== id));
            store.setView("dashboard");
          }}
          onRequestConfirm={setConfirmDialog}
        />
        <ConfirmDialog
          dialog={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      </>
    );

  return (
    <>
      <Dashboard
        characters={characters}
        loading={loading}
        error={error}
        reload={reload}
        onRequestConfirm={setConfirmDialog}
      />
      <ConfirmDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </>
  );
}

function Shell({
  children,
  eyebrow,
  title,
  action,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col gap-4 border-b border-[#3b3933] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label gold">Kniha postav · D&D 2024 SRD 5.2.1</p>
          <h1 className="mt-2 text-3xl font-semibold md:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-[#a99d87]">{eyebrow}</p>
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}

function Dashboard({
  characters,
  loading,
  error,
  reload,
  onRequestConfirm,
}: {
  characters: SavedCharacter[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  onRequestConfirm: (dialog: ConfirmDialogState) => void;
}) {
  const { startNew, showProfile } = useCharacterStore();
  const deleteCharacter = async (character: SavedCharacter) => {
    onRequestConfirm({
      title: "Smazat postavu",
      message: `Opravdu smazat postavu „${character.name}“?`,
      onConfirm: async () => {
        const response = await fetch(`${API}/api/characters/${character.id}`, {
          method: "DELETE",
        });
        if (!response.ok) return;
        await reload();
      },
    });
  };

  return (
    <Shell
      title="Postavy"
      eyebrow="Lokální databáze postav a jejich vybavení"
      action={
        <button
          onClick={startNew}
          className="bg-[#d69b4a] px-5 py-3 text-sm font-bold text-[#281b0d]"
        >
          + Vytvořit novou postavu
        </button>
      }
    >
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">Postavy</p>
            <h2 className="mt-1 text-2xl md:text-3xl">Seznam</h2>
          </div>
          <button onClick={() => void reload()} className="label gold">
            Obnovit
          </button>
        </div>
        {error && <p className="mt-4 text-red-300">{error}</p>}
        {loading ? (
          <p className="mt-8 text-[#a99d87]">Načítám místní databázi...</p>
        ) : characters.length === 0 ? (
          <div className="mt-8 border border-dashed border-[#3b3933] p-8 text-center text-[#a99d87]">
            Zatím tu není žádná postava. Klikni na „+ Vytvořit novou postavu“ a začni.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {characters.map((character) => (
              <article key={character.id} className="choice flex flex-col justify-between p-5">
                <button onClick={() => showProfile(character)} className="w-full text-left">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="label gold">
                        {pretty(character.species_id)} · {pretty(character.class_id)}
                      </p>
                      <h3 className="mt-2 text-2xl">{character.name}</h3>
                    </div>
                    <span className="label">lvl {character.level}</span>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2 border-t border-[#3b3933] pt-4 text-left">
                    <Metric name="HP" value={character.max_hp} />
                    <Metric name="AC" value={character.armor_class} />
                    <Metric name="Iniciativa" value={character.initiative >= 0 ? `+${character.initiative}` : character.initiative} />
                  </div>
                </button>
                <div className="mt-5 flex items-center justify-between border-t border-[#3b3933] pt-3">
                  <span className="text-xs text-[#a99d87]">{pretty(character.background_id)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteCharacter(character);
                    }}
                    className="text-xs font-semibold text-red-400 hover:text-red-200 hover:underline px-2.5 py-1 border border-red-900/60 bg-red-950/40 rounded transition"
                  >
                    🗑️ Smazat
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

function Metric({ name, value }: { name: string; value: string | number }) {
  return (
    <div>
      <p className="label">{name}</p>
      <strong className="mt-1 block text-2xl gold">{value}</strong>
    </div>
  );
}

function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialogState | null;
  onClose: () => void;
}) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0c]/70 p-4">
      <div className="w-full max-w-md border border-[#3b3933] bg-[#1d1c1a] p-6 shadow-2xl">
        <p className="label gold">{dialog.title}</p>
        <h3 className="mt-3 text-2xl font-semibold">Potvrzení</h3>
        <p className="mt-3 text-sm text-[#a99d87]">{dialog.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-[#3b3933] px-4 py-2 text-sm text-[#e7e1d7]"
          >
            Zrušit
          </button>
          <button
            onClick={() => {
              dialog.onConfirm();
              onClose();
            }}
            className="bg-[#d69b4a] px-4 py-2 text-sm font-bold text-[#281b0d]"
          >
            Potvrdit
          </button>
        </div>
      </div>
    </div>
  );
}

function Wizard({
  catalog,
  onSaved,
}: {
  catalog: RuleCatalog | null;
  onSaved: (character: SavedCharacter) => void;
}) {
  const store = useCharacterStore();
  const [stats, setStats] = useState<DerivedStats | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totalPoints = abilities.reduce(
    (sum, ability) => sum + cost(store.base_scores[ability]),
    0,
  );

  const payload = {
    class_id: store.class_id,
    species_id: store.species_id,
    background_id: store.background_id,
    level: store.level,
    ability_method: store.ability_method,
    base_scores: store.base_scores,
    background_boosts: store.background_boosts,
    species_choices: store.species_choices,
    equipment_choices: store.equipment_choices,
    rolled_scores: store.rolled_scores,
    selected_masteries: store.selected_masteries,
    selected_weapons: store.selected_weapons,
    starting_equipment_choices: store.starting_equipment_choices,
    selected_spells: store.selected_spells,
    selected_skills: store.selected_skills,
    selected_languages: store.selected_languages,
    details: store.details,
    armor: store.armor,
    shield: store.shield,
    proficient_perception: store.proficient_perception,
    subclass_id: store.subclass_id,
    general_feats: store.general_feats,
  };

  const totalCost = totalPoints;
  const scoreValid =
    store.ability_method === "point_buy"
      ? totalCost === 27
      : store.ability_method === "standard_array"
        ? JSON.stringify(Object.values(store.base_scores).sort((a, b) => b - a)) === JSON.stringify([15, 14, 13, 12, 10, 8])
        : Object.values(store.base_scores).every((score) => score >= 1 && score <= 20);
  const boostValues = Object.values(store.background_boosts);
  const boostsValid =
    JSON.stringify(boostValues.sort((a, b) => a - b)) === JSON.stringify([1, 2]) ||
    JSON.stringify(boostValues.sort((a, b) => a - b)) === JSON.stringify([1, 1, 1]);
  const skillRule = catalog?.character_creation.skill_choices[store.class_id];
  const skillsValid = !skillRule || store.selected_skills.length <= skillRule.count;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(`${API}/api/rules/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(formatApiError(body.detail ?? body));
        return body;
      })
      .then(setStats)
      .catch((reason) => {
        if (reason.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Vybral jsi špatně zvýšení atributů. Vyber pouze jeden +2 a jeden +1.");
        }
      });
    return () => controller.abort();
  }, [
    store.class_id,
    store.species_id,
    store.background_id,
    store.level,
    store.ability_method,
    JSON.stringify(store.base_scores),
    JSON.stringify(store.background_boosts),
    JSON.stringify(store.species_choices),
    JSON.stringify(store.equipment_choices),
    JSON.stringify(store.selected_masteries),
    JSON.stringify(store.selected_skills),
    JSON.stringify(store.selected_spells),
    JSON.stringify(store.armor),
    store.shield,
    JSON.stringify(store.details),
  ]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API}/api/characters${store.editingId ? `/${store.editingId}` : ""}`,
        {
          method: store.editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: payload,
            inventory: store.editingId
              ? store.selectedCharacter?.inventory ?? []
              : stats?.calculated_inventory ?? [],
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(formatApiError(body.detail ?? body));
      onSaved(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vybral jsi špatně zvýšení atributů. Vyber pouze jeden +2 a jeden +1.");
    } finally {
      setSaving(false);
    }
  };

  const stepNames = [
    "Koncept",
    "Povolání",
    "Původ",
    "Druh",
    "Atributy",
    "Dovednosti a jazyky",
    "Featy a vlastnosti",
    "Vybavení",
    "Kouzla",
    "Shrnutí",
  ];

  return (
    <Shell
      title={store.editingId ? "Upravit postavu" : "Zrození postavy"}
      eyebrow="Průvodce tvorbou podle D&D 2024 SRD 5.2.1"
      action={
        <button onClick={() => store.setView("dashboard")} className="label">
          Zrušit
        </button>
      }
    >
      <div className="mb-8 grid grid-cols-5 gap-2 md:grid-cols-10">
        {stepNames.map((name, index) => (
          <button
            key={name}
            onClick={() => index + 1 <= store.step && store.setStep(index + 1)}
            className={`border-b-2 pb-2 text-left text-xs ${
              store.step === index + 1
                ? "border-[#d69b4a] text-[#d69b4a] font-bold"
                : index + 1 < store.step
                  ? "border-[#3b3933] text-[#d69b4a]"
                  : "border-[#3b3933] text-[#a99d87]"
            }`}
          >
            <span className="block font-mono text-[10px]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="truncate">{name}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="panel p-6 md:p-8 min-h-[30rem]">
          {store.step === 1 && <Step1Concept catalog={catalog} />}
          {store.step === 2 && <Step2Class catalog={catalog} />}
          {store.step === 3 && <Step3Background catalog={catalog} />}
          {store.step === 4 && <Step4Species catalog={catalog} />}
          {store.step === 5 && <Step5AbilityScores totalPoints={totalPoints} />}
          {store.step === 6 && <Step6Proficiencies catalog={catalog} />}
          {store.step === 7 && <Step7FeatsTraits catalog={catalog} />}
          {store.step === 8 && <Step8Equipment catalog={catalog} />}
          {store.step === 9 && <Step9Spells catalog={catalog} />}
          {store.step === 10 && <Step10Review catalog={catalog} stats={stats} error={error} />}

          <div className="mt-10 flex items-center justify-between border-t border-[#3b3933] pt-5">
            <button
              onClick={() => store.setStep(Math.max(1, store.step - 1))}
              disabled={store.step === 1}
              className="label disabled:opacity-30"
            >
              ← Zpět
            </button>
            <p className="text-center text-xs text-[#a99d87]">
              Krok {store.step} z 10
            </p>
            <div>
              {store.step < 10 ? (
                <button
                  onClick={() => store.setStep(store.step + 1)}
                  disabled={
                    (store.step === 1 && !store.details.name.trim()) ||
                    (store.step === 3 && !boostsValid) ||
                    (store.step === 5 && !scoreValid) ||
                    (store.step === 6 && !skillsValid)
                  }
                  className="bg-[#d69b4a] px-5 py-3 text-sm font-bold text-[#281b0d] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Další →
                </button>
              ) : (
                <button
                  onClick={() => void save()}
                  disabled={saving || !store.details.name.trim() || !stats || !scoreValid || !boostsValid || !skillsValid}
                  className="bg-[#d69b4a] px-5 py-3 text-sm font-bold text-[#281b0d] disabled:opacity-40"
                >
                  {saving ? "Ukládám..." : "Uložit postavu"}
                </button>
              )}
            </div>
          </div>
          {error && <p className="mt-4 text-red-300">{error}</p>}
        </section>

        {/* Live Character Summary Sidebar */}
        <aside className="panel p-5 h-fit">
          <p className="label gold">Živý náhled postavy</p>
          <h3 className="mt-2 text-2xl font-semibold">{store.details.name || "Neznámý hrdina"}</h3>
          <p className="mt-1 text-xs text-[#a99d87]">
            Lvl {store.level} · {pretty(store.species_id)} · {pretty(store.class_id)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#3b3933] pt-3 text-sm">
            <div><span className="label">HP</span> <strong className="gold block text-lg">{stats?.max_hp ?? "–"}</strong></div>
            <div><span className="label">AC</span> <strong className="gold block text-lg">{stats?.armor_class ?? "–"}</strong></div>
            <div><span className="label">Iniciativa</span> <span className="block">{stats ? (stats.initiative >= 0 ? `+${stats.initiative}` : stats.initiative) : "–"}</span></div>
            <div><span className="label">Prof. bonus</span> <span className="block">{stats ? `+${stats.proficiency_bonus}` : "–"}</span></div>
          </div>
          <div className="mt-4 border-t border-[#3b3933] pt-3">
            <p className="label">Atributy (finální)</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
              {abilities.map((ab) => (
                <div key={ab} className="bg-[#22221f] p-1.5 text-center border border-[#3b3933]">
                  <span className="label text-[10px]">{labels[ab].slice(0, 3)}</span>
                  <strong className="block text-sm">{stats?.final_scores[ab] ?? store.base_scores[ab]}</strong>
                  <span className="text-[10px] text-[#a99d87]">
                    {stats ? (stats.modifiers[ab] >= 0 ? `+${stats.modifiers[ab]}` : stats.modifiers[ab]) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-[#3b3933] pt-3 text-xs text-[#a99d87] space-y-1">
            <p><strong className="gold">Původ:</strong> {pretty(store.background_id)}</p>
            <p><strong className="gold">Zázemí:</strong> {pretty(store.background_id)} · {store.details.alignment}</p>
            <p><strong className="gold">Podpovolání:</strong> {store.subclass_id ? pretty(store.subclass_id) : "—"}</p>
            <p><strong className="gold">Inventář:</strong> {stats?.calculated_inventory.length ?? 0} položek</p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

/* ---------------- STEP COMPONENTS ---------------- */

function Step1Concept({ catalog }: { catalog: RuleCatalog | null }) {
  const { details, setDetails, level, setField } = useCharacterStore();
  const maxLevel = catalog?.character_creation.level_max ?? 20;

  return (
    <div>
      <p className="label">Krok 01 / Koncept postavy</p>
      <h2 className="mt-2 text-3xl font-semibold">Identita a úroveň</h2>
      <div className="mt-6 space-y-6 max-w-xl">
        <label className="block">
          <span className="label">Jméno postavy *</span>
          <input
            autoFocus
            value={details.name}
            onChange={(event) => setDetails({ name: event.target.value })}
            className="mt-2 block w-full border border-[#3b3933] bg-[#22221f] p-3 text-lg"
            placeholder="např. Valerius Stínový"
          />
        </label>
        <div>
          <span className="label">Úroveň postavy (1–{maxLevel})</span>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={maxLevel}
              value={level}
              onChange={(e) => setField("level", Number(e.target.value))}
              className="flex-1 accent-[#d69b4a]"
            />
            <span className="text-xl gold font-bold w-12 text-center border border-[#3b3933] py-1 bg-[#22221f]">
              {level}
            </span>
          </div>
        </div>

        <div className="border border-[#3b3933] bg-[#22221f] p-4 text-sm text-[#a99d87]">
          <p className="label gold">Tvorba + vedení postavy</p>
          <p className="mt-2">
            Tato aplikace pokrývá celý cyklus postavy: tvorbu, výběr proficience, zázemí, vlastní vybavení, kouzla a následnou správu postavy během hry.
          </p>
        </div>
        <label className="block">
          <span className="label">Přesvědčení</span>
          <select
            value={details.alignment}
            onChange={(e) => setDetails({ alignment: e.target.value })}
            className="mt-2 block w-full border border-[#3b3933] bg-[#22221f] p-3"
          >
            {(catalog?.character_creation.alignment_options ?? []).map((align) => (
              <option key={align}>{align}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Osobní popis a historie</span>
          <textarea
            value={details.description}
            onChange={(e) => setDetails({ description: e.target.value })}
            className="mt-2 block w-full min-h-24 border border-[#3b3933] bg-[#22221f] p-3 text-sm"
            placeholder="Vzhled, cíle, motivace a původ postavy..."
          />
        </label>
      </div>
    </div>
  );
}

function Step2Class({ catalog }: { catalog: RuleCatalog | null }) {
  const { class_id, level, setField, subclass_id, selected_masteries } = useCharacterStore();
  const currentClass = catalog?.classes.find((c) => c.id === class_id);
  const availableSubclasses = (catalog?.subclasses ?? []).filter(
    (subclass) => subclass.class_id === class_id && subclass.level <= level,
  );
  const selectedSubclass = availableSubclasses.find((subclass) => subclass.id === subclass_id) ?? null;

  return (
    <div>
      <p className="label">Krok 02 / Povolání</p>
      <h2 className="mt-2 text-3xl font-semibold">Vyber své povolání</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {(catalog?.classes ?? []).map((rule) => (
          <button
            key={rule.id}
            onClick={() => {
              setField("class_id", rule.id);
              setField("selected_skills", []);
              setField("selected_spells", []);
              setField("selected_weapons", []);
              setField("subclass_id", null);
              setField("selected_masteries", selected_masteries.slice(0, rule.weapon_mastery_count));
              if (!rule.armor_training?.includes("shields")) setField("shield", false);
              setField("armor", { base_ac: 10, category: "unarmored" });
            }}
            className={`choice text-left ${rule.id === class_id ? "active" : ""}`}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl">{rule.name}</h3>
              <span className="gold text-sm font-mono">d{rule.hit_die} HP</span>
            </div>
            <p className="mt-2 text-xs text-[#a99d87]">
              Atributy: {rule.primary_ability.map(pretty).join(", ")}
            </p>
            <p className="mt-1 text-xs text-[#a99d87]">
              Záchrany: {rule.saving_throws.map(pretty).join(", ")}
            </p>
          </button>
        ))}
      </div>

      {currentClass && (
        <div className="mt-8 border-t border-[#3b3933] pt-6">
          <p className="label gold">Vlastnosti povolání {currentClass.name}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-[#a99d87]">
            <p><strong>Hod kostky:</strong> 1d{currentClass.hit_die} za úroveň</p>
            <p><strong>Zbroj:</strong> {currentClass.armor_training?.join(", ") || "Bez zbroje"}</p>
            <p><strong>Zbraně:</strong> {currentClass.proficiencies.join(", ")}</p>
            <p><strong>Mistrovství se zbraněmi:</strong> {currentClass.weapon_mastery_count}</p>
          </div>

          {level >= currentClass.subclass_level && (
            <div className="mt-6 border-t border-[#3b3933] pt-4">
              <label className="block max-w-md">
                <span className="label gold">Podpovolání (od {currentClass.subclass_level}. úrovně)</span>
                <select
                  value={subclass_id ?? ""}
                  onChange={(e) => setField("subclass_id", e.target.value || null)}
                  className="mt-2 block w-full border border-[#3b3933] bg-[#22221f] p-3"
                >
                  <option value="">Vyber podpovolání</option>
                  {availableSubclasses.map((subclass) => (
                    <option key={subclass.id} value={subclass.id}>{subclass.name}</option>
                  ))}
                </select>
                {selectedSubclass && (
                  <div className="mt-3 border border-[#3b3933] bg-[#22221f] p-3 text-sm text-[#a99d87]">
                    <p className="gold font-semibold">{selectedSubclass.name}</p>
                    <p className="mt-1">{selectedSubclass.description}</p>
                    {selectedSubclass.features.length > 0 && (
                      <p className="mt-2 text-xs">
                        <strong className="gold">Vlastnosti:</strong> {selectedSubclass.features.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step3Background({ catalog }: { catalog: RuleCatalog | null }) {
  const { background_id, setField, background_boosts, setBoost, resetBoosts } = useCharacterStore();
  const currentBg = catalog?.backgrounds.find((b) => b.id === background_id);
  const allowed = currentBg?.allowed_ability_boosts ?? [];

  return (
    <div>
      <p className="label">Krok 03 / Původ</p>
      <h2 className="mt-2 text-3xl font-semibold">Tvé zázemí a původ</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {(catalog?.backgrounds ?? []).map((bg) => (
          <button
            key={bg.id}
            onClick={() => {
              setField("background_id", bg.id);
              resetBoosts();
            }}
            className={`choice text-left ${bg.id === background_id ? "active" : ""}`}
          >
            <h3 className="text-lg">{bg.name}</h3>
            <p className="mt-1 text-xs text-[#a99d87]">Origin Feat: {bg.origin_feat}</p>
            <p className="mt-1 text-xs text-[#a99d87]">Dovednosti: {bg.skills.join(", ")}</p>
          </button>
        ))}
      </div>

      {currentBg && (
        <div className="mt-8 border-t border-[#3b3933] pt-6">
          <p className="label gold">Zvýšení atributů</p>
          <p className="mt-1 text-xs text-[#a99d87]">
            Podle SRD 5.2.1 smíš zvýšit atributy pouze ze 3 povolených pro toto zázemí ({allowed.map(pretty).join(", ")}). Model +2/+1 nebo +1/+1/+1.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {allowed.map((ab) => (
              <button
                key={ab}
                onClick={() => setBoost(ab, background_boosts[ab] === 2 ? 0 : background_boosts[ab] === 1 ? 2 : 1)}
                className={`border px-4 py-2 text-sm font-semibold ${
                  background_boosts[ab] ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
                }`}
              >
                {labels[ab]} {background_boosts[ab] ? `+${background_boosts[ab]}` : "+0"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step4Species({ catalog }: { catalog: RuleCatalog | null }) {
  const { species_id, setField, species_choices, setSpeciesChoice } = useCharacterStore();
  const currentSpecies = catalog?.species.find((s) => s.id === species_id);

  return (
    <div>
      <p className="label">Krok 04 / Druh</p>
      <h2 className="mt-2 text-3xl font-semibold">Vyber svůj druh</h2>
      <p className="mt-1 text-xs text-[#a99d87]">
        V D&D 2024 SRD 5.2.1 druh neposkytuje zvýšení atributů, ale dává vrozené vlastnosti a volby.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {(catalog?.species ?? []).map((sp) => (
          <button
            key={sp.id}
            onClick={() => setField("species_id", sp.id)}
            className={`choice text-left ${sp.id === species_id ? "active" : ""}`}
          >
            <h3 className="text-xl">{sp.name}</h3>
            <p className="mt-1 text-xs text-[#a99d87]">Velikost: {sp.size} · Rychlost: {sp.speed} ft</p>
            <p className="mt-1 text-xs text-[#a99d87]">Schopnosti: {sp.traits.join(", ")}</p>
          </button>
        ))}
      </div>

      {currentSpecies?.options && currentSpecies.options.length > 0 && (
        <div className="mt-8 border-t border-[#3b3933] pt-6">
          <p className="label gold">Druhové volby pro {currentSpecies.name}</p>
          <div className="mt-4 space-y-4 max-w-xl">
            {currentSpecies.options.map((opt) => (
              <div key={opt.id} className="border border-[#3b3933] p-4 bg-[#22221f]">
                <h4 className="font-semibold gold">{opt.name}</h4>
                <p className="mt-1 text-xs text-[#a99d87]">{opt.description}</p>
                {opt.choices ? (
                  <select
                    value={species_choices[opt.id] ?? ""}
                    onChange={(e) => setSpeciesChoice(opt.id, e.target.value)}
                    className="mt-3 block w-full border border-[#3b3933] bg-[#1a1a18] p-2 text-sm"
                  >
                    <option value="">Vyber možnost...</option>
                    {opt.choices.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={species_choices[opt.id] ?? ""}
                    onChange={(e) => setSpeciesChoice(opt.id, e.target.value)}
                    className="mt-3 block w-full border border-[#3b3933] bg-[#1a1a18] p-2 text-sm"
                    placeholder="Zadej svou volbu..."
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step5AbilityScores({ totalPoints }: { totalPoints: number }) {
  const { ability_method, setField, base_scores, setScore, swapScore, rollDiceScores, rolled_scores } = useCharacterStore();

  const methods = [
    ["point_buy", "Výkup bodů (27 bodů)"],
    ["standard_array", "Standardní pole [15,14,13,12,10,8]"],
    ["rolls", "Hody 4d6 (odhoď nejhorší)"],
    ["manual", "Ruční zadání"],
  ] as const;

  return (
    <div>
      <p className="label">Krok 05 / Základní atributy</p>
      <h2 className="mt-2 text-3xl font-semibold">Generování a úprava atributů</h2>

      <div className="mt-6 flex flex-wrap gap-2">
        {methods.map(([method, label]) => (
          <button
            key={method}
            onClick={() => {
              setField("ability_method", method);
              if (method === "point_buy") abilities.forEach((ab) => setScore(ab, 8));
              if (method === "standard_array") {
                const std = [15, 14, 13, 12, 10, 8];
                abilities.forEach((ab, i) => setScore(ab, std[i]));
              }
              if (method === "rolls") rollDiceScores();
            }}
            className={`border px-4 py-2 text-sm font-semibold ${
              ability_method === method ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {ability_method === "rolls" && (
        <div className="mt-4 flex items-center gap-4">
          <button onClick={rollDiceScores} className="bg-[#d69b4a] px-4 py-2 text-xs font-bold text-[#281b0d]">
            🎲 Hodit nové hody (4d6, odhoď nejhorší)
          </button>
          {rolled_scores.length > 0 && (
            <span className="text-xs text-[#a99d87]">
              Vyhozené hodnoty: [{rolled_scores.join(", ")}]
            </span>
          )}
        </div>
      )}

      {ability_method === "point_buy" && (
        <p className="mt-4 text-xs text-[#a99d87]">
          Body vygenerovány: <span className="gold font-bold">{totalPoints} / 27</span>
        </p>
      )}

      {(ability_method === "standard_array" || ability_method === "rolls") && (
        <p className="mt-4 text-xs text-[#a99d87]">
          Přiřaď každou hodnotu jednomu atributu. Pokud upravíš hodnotu v jiném poli, hodnoty se jednoduše prohodí.
        </p>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {abilities.map((ab) => {
          const val = base_scores[ab];
          const nextCost = cost(val + 1) - cost(val);
          const canInc = ability_method !== "point_buy" || (val < 15 && totalPoints + nextCost <= 27);
          const fixedSet = ability_method === "standard_array" ? [15, 14, 13, 12, 10, 8] : ability_method === "rolls" ? rolled_scores : null;

          return (
            <div key={ab} className="flex items-center justify-between border border-[#3b3933] p-3 bg-[#22221f]">
              <div>
                <strong className="text-base">{labels[ab]}</strong>
                <span className="block text-[10px] text-[#a99d87]">{abilityHelp[ab]}</span>
              </div>
              {fixedSet ? (
                <select
                  value={val}
                  onChange={(e) => swapScore(ab, Number(e.target.value))}
                  className="border border-[#3b3933] bg-[#1a1a18] p-2 text-lg gold"
                >
                  {[...new Set([val, ...fixedSet])].sort((a, b) => b - a).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setScore(ab, Math.max(1, val - 1))}
                    disabled={ability_method === "point_buy" && val <= 8}
                    className="px-3 py-1 border border-[#3b3933] text-lg gold disabled:opacity-30"
                  >
                    −
                  </button>
                  <strong className="w-6 text-center text-lg">{val}</strong>
                  <button
                    onClick={() => setScore(ab, Math.min(20, val + 1))}
                    disabled={!canInc}
                    className="px-3 py-1 border border-[#3b3933] text-lg gold disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step6Proficiencies({ catalog }: { catalog: RuleCatalog | null }) {
  const { class_id, selected_skills, setField, selected_languages, toggleLanguage } = useCharacterStore();
  const rule = catalog?.character_creation.skill_choices[class_id];

  const toggleSkill = (skill: string) => {
    if (selected_skills.includes(skill)) {
      setField("selected_skills", selected_skills.filter((s) => s !== skill));
    } else if (!rule || selected_skills.length < rule.count) {
      setField("selected_skills", [...selected_skills, skill]);
    }
  };

  return (
    <div>
      <p className="label">Krok 06 / Dovednosti a jazyky</p>
      <h2 className="mt-2 text-3xl font-semibold">Dovednosti a jazyky</h2>

      {rule && (
        <div className="mt-6">
          <div className="flex justify-between items-center">
            <p className="label gold">Dovednosti povolání (Povolání {pretty(class_id)})</p>
            <span className="label">
              Vybráno {selected_skills.length} / max {rule.count}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {rule.options.map((skill) => (
              <button
                disabled={!selected_skills.includes(skill) && selected_skills.length >= rule.count}
                key={skill}
                onClick={() => toggleSkill(skill)}
                className={`border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-30 ${
                  selected_skills.includes(skill) ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
                }`}
              >
                {pretty(skill)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-[#3b3933] pt-6">
        <p className="label gold">Jazyky postavy</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="border border-[#d69b4a] px-3 py-2 text-sm text-[#d69b4a] bg-[#2e2617]">Common (Základní)</span>
          {(catalog?.character_creation.standard_languages ?? []).filter((l) => l !== "Common").map((lang) => (
            <button
              key={lang}
              onClick={() => toggleLanguage(lang)}
              className={`border px-3 py-2 text-sm ${
                selected_languages.includes(lang) ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step7FeatsTraits({ catalog }: { catalog: RuleCatalog | null }) {
  const { class_id, species_id, background_id, level, selected_masteries, toggleMastery, general_feats, toggleGeneralFeat } = useCharacterStore();
  const currentClass = catalog?.classes.find((c) => c.id === class_id);
  const currentSpecies = catalog?.species.find((s) => s.id === species_id);
  const currentBackground = catalog?.backgrounds.find((b) => b.id === background_id);
  const masteryLimit = currentClass?.weapon_mastery_count ?? 0;
  const featSlots = generalFeatSlots(level);

  return (
    <div>
      <p className="label">Krok 07 / Featy a vlastnosti</p>
      <h2 className="mt-2 text-3xl font-semibold">Featy, mistrovství se zbraněmi a vlastnosti druhu</h2>

      <div className="mt-6 border border-[#3b3933] bg-[#22221f] p-4">
        <p className="label gold">Origin Feat (ze zázemí)</p>
        <p className="mt-2 text-sm">
          <strong className="gold">{currentBackground?.origin_feat ?? "—"}</strong> — automaticky získán ze zázemí {currentBackground?.name}.
        </p>
      </div>

      {(currentSpecies?.traits.length ?? 0) > 0 && (
        <div className="mt-6 border border-[#3b3933] bg-[#22221f] p-4">
          <p className="label gold">Vrozené vlastnosti druhu ({currentSpecies?.name})</p>
          <p className="mt-2 text-sm text-[#a99d87]">{currentSpecies?.traits.join(", ")}</p>
        </div>
      )}

      <div className="mt-6">
        <div className="flex justify-between items-center">
          <p className="label gold">Obecné Featy (Ability Score Improvement na úrovních 4/8/12/16/19)</p>
          <span className="label">Vybráno {general_feats.length} / {featSlots}</span>
        </div>
        {featSlots === 0 ? (
          <p className="mt-2 text-sm text-[#a99d87]">Na 1. úrovni ještě nemáš žádný slot pro obecný feat. První slot přichází na 4. úrovni.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(catalog?.feats ?? []).filter((f) => f.name !== currentBackground?.origin_feat).map((f) => (
              <button
                key={f.id}
                disabled={!general_feats.includes(f.name) && general_feats.length >= featSlots}
                onClick={() => toggleGeneralFeat(f.name, featSlots)}
                className={`border p-3 text-left disabled:cursor-not-allowed disabled:opacity-30 ${
                  general_feats.includes(f.name) ? "border-[#d69b4a] bg-[#2e2617] text-[#d69b4a]" : "border-[#3b3933] text-[#a99d87]"
                }`}
              >
                <strong className="block">{f.name}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      {masteryLimit > 0 ? (
        <div className="mt-6">
          <div className="flex justify-between items-center">
            <p className="label gold">Weapon Mastery (Mistrovství se zbraněmi)</p>
            <span className="label">Vybráno {selected_masteries.length} / {masteryLimit}</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(catalog?.masteries ?? []).map((m) => (
              <button
                key={m.id}
                disabled={!selected_masteries.includes(m.id) && selected_masteries.length >= masteryLimit}
                onClick={() => toggleMastery(m.id)}
                className={`border p-3 text-left disabled:cursor-not-allowed disabled:opacity-30 ${
                  selected_masteries.includes(m.id) ? "border-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
                }`}
              >
                <strong className="gold block">{m.name}</strong>
                <span className="text-xs text-[#a99d87] block mt-1">{m.summary}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-[#a99d87]">
          {pretty(class_id)} nemá podle SRD 5.2.1 přístup k Weapon Mastery.
        </p>
      )}
    </div>
  );
}

function Step8Equipment({ catalog }: { catalog: RuleCatalog | null }) {
  const {
    class_id,
    background_id,
    equipment_choices,
    setEquipmentChoice,
  } = useCharacterStore();

  const classGroups = catalog?.starting_equipment.class_equipment[class_id] ?? [];
  const bgGroups = catalog?.starting_equipment.background_equipment[background_id] ?? [];

  // Auto-select the first option for required groups so the UI never silently
  // relies on the backend's own default and the visible state always matches what gets saved.
  useEffect(() => {
    for (const group of [...classGroups, ...bgGroups]) {
      if (group.required !== false && !equipment_choices[group.groupId] && group.options[0]) {
        setEquipmentChoice(group.groupId, group.options[0].optionId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [class_id, background_id]);

  return (
    <div>
      <p className="label">Krok 08 / Vybavení a Výzbroj</p>
      <h2 className="mt-2 text-3xl font-semibold">Výběr počátečního vybavení</h2>

      <div className="mt-6 space-y-6">
        <div>
          <h3 className="text-xl gold font-semibold">Vybavení z Povolání ({pretty(class_id)})</h3>
          <div className="mt-3 space-y-4">
            {classGroups.map((group) => (
              <div key={group.groupId} className="border border-[#3b3933] p-4 bg-[#22221f]">
                <h4 className="font-semibold text-base">{group.label}</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {group.options.map((opt) => (
                    <button
                      key={opt.optionId}
                      onClick={() => setEquipmentChoice(group.groupId, opt.optionId)}
                      className={`border p-3 text-left ${
                        equipment_choices[group.groupId] === opt.optionId
                          ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]"
                          : "border-[#3b3933] text-[#a99d87]"
                      }`}
                    >
                      <strong className="block text-sm">{opt.label}</strong>
                      <span className="text-xs block mt-1">
                        Položky: {opt.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xl gold font-semibold">Vybavení ze Zázemí ({pretty(background_id)})</h3>
          <div className="mt-3 space-y-4">
            {bgGroups.map((group) => (
              <div key={group.groupId} className="border border-[#3b3933] p-4 bg-[#22221f]">
                <h4 className="font-semibold text-base">{group.label}</h4>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {group.options.map((opt) => (
                    <button
                      key={opt.optionId}
                      onClick={() => setEquipmentChoice(group.groupId, opt.optionId)}
                      className={`border p-3 text-left ${
                        equipment_choices[group.groupId] === opt.optionId
                          ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]"
                          : "border-[#3b3933] text-[#a99d87]"
                      }`}
                    >
                      <strong className="block text-sm">{opt.label}</strong>
                      <span className="text-xs block mt-1">
                        Položky: {opt.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#3b3933] pt-6">
          <p className="text-xs text-[#a99d87]">
            Tato část slouží k výběru startovního vybavení a doplnění postavy před první hrou. Vybavení lze v profilu kdykoli upravit i během kampaně.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step9Spells({ catalog }: { catalog: RuleCatalog | null }) {
  const { class_id, level, base_scores, background_boosts, selected_spells, toggleSpell } = useCharacterStore();
  const spellRule = catalog?.spellcasting[class_id];
  const currentClass = catalog?.classes.find((c) => c.id === class_id);
  const spells = (catalog?.spells ?? []).filter((s) => s.classes.includes(class_id));

  if (!spellRule) {
    return (
      <div>
        <p className="label">Krok 09 / Kouzla</p>
        <h2 className="mt-2 text-3xl font-semibold">Povolání nesesílá kouzla</h2>
        <p className="mt-4 text-sm text-[#a99d87]">
          Povolání {pretty(class_id)} nemá v SRD 5.2.1 schopnost sesílat kouzla. Můžeš pokračovat na závěrečný krok.
        </p>
      </div>
    );
  }

  const castingAbility = spellRule.ability as keyof typeof base_scores;
  const castingScore = (base_scores[castingAbility] ?? 8) + (background_boosts[castingAbility] ?? 0);
  const castingModifier = Math.floor((castingScore - 10) / 2);
  const { cantripsLimit, leveledLimit, maxSpellLevel } = computeSpellLimits(
    class_id,
    level,
    currentClass?.spellcasting,
    spellRule.cantrips_level_1,
    castingModifier,
  );
  const spellLevels = Array.from(new Set(spells.map((s) => s.level)))
    .filter((lvl) => lvl === 0 || lvl <= maxSpellLevel)
    .sort((a, b) => a - b);
  const selectedCantrips = selected_spells.filter((id) => spells.find((s) => s.id === id)?.level === 0).length;
  const selectedLeveled = selected_spells.filter((id) => (spells.find((s) => s.id === id)?.level ?? 0) > 0).length;

  return (
    <div>
      <p className="label">Krok 09 / Kouzla</p>
      <h2 className="mt-2 text-3xl font-semibold">Výběr kouzel ({pretty(class_id)} – úroveň {level})</h2>
      <p className="mt-1 text-xs text-[#a99d87]">
        Kouzla jsou sesílána přes atribut: <span className="gold font-bold">{pretty(spellRule.ability)}</span> · Max. úroveň kouzla: <span className="gold font-bold">{maxSpellLevel}</span> · Save DC = 8 + bonus proficience + modul {pretty(spellRule.ability)} · Attack bonus = bonus proficience + modul {pretty(spellRule.ability)}
      </p>
      <div className="mt-3 flex gap-4 text-xs">
        <span className={selectedCantrips === cantripsLimit ? "gold" : "text-[#a99d87]"}>Cantripy: {selectedCantrips} / {cantripsLimit}</span>
        <span className={selectedLeveled === leveledLimit ? "gold" : "text-[#a99d87]"}>Připravená kouzla: {selectedLeveled} / {leveledLimit}</span>
      </div>
      <div className="mt-3 border border-[#3b3933] bg-[#22221f] p-3 text-xs text-[#a99d87]">
        Tato část pokrývá celé kouzelnické vedení postavy: výběr cantripů, připravených kouzel a přehled slotů při postupu do vyšších úrovní.
      </div>

      <div className="mt-6 space-y-6">
        {spellLevels.map((lvl) => {
          const levelSpells = spells.filter((s) => s.level === lvl);
          const limitForLevel = lvl === 0 ? cantripsLimit : leveledLimit;
          const selectedForLevel = lvl === 0 ? selectedCantrips : selectedLeveled;
          return (
            <div key={lvl}>
              <h3 className="label gold font-semibold">
                {lvl === 0 ? "Cantripy (Trikobraní - Úroveň 0)" : `Kouzla ${lvl}. úrovně`}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {levelSpells.map((s) => {
                  const isSelected = selected_spells.includes(s.id);
                  const atLimit = selectedForLevel >= limitForLevel;
                  return (
                    <button
                      key={s.id}
                      disabled={!isSelected && atLimit}
                      onClick={() => toggleSpell(s.id)}
                      className={`border p-3 text-left disabled:cursor-not-allowed disabled:opacity-30 ${
                        isSelected ? "border-[#d69b4a] text-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] text-[#a99d87]"
                      }`}
                    >
                      <strong className="block text-sm">{s.name}</strong>
                      <span className="text-[10px] block">{s.school} · {s.casting_time} · {s.range_area}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step10Review({
  catalog,
  stats,
  error,
}: {
  catalog: RuleCatalog | null;
  stats: DerivedStats | null;
  error: string;
}) {
  return (
    <div>
      <p className="label">Krok 10 / Závěrečná kontrola</p>
      <h2 className="mt-2 text-3xl font-semibold">Souhrn postavy k uložení</h2>

      {error && (
        <div className="mt-4 border border-red-500 bg-red-950/30 p-4 text-red-200 text-sm">
          ⚠️ <strong>Varování pravidel:</strong> {error}
        </div>
      )}

      {stats && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric name="HP" value={stats.max_hp} />
            <Metric name="AC" value={stats.armor_class} />
            <Metric name="Iniciativa" value={stats.initiative >= 0 ? `+${stats.initiative}` : stats.initiative} />
            <Metric name="Proficiency Bonus" value={`+${stats.proficiency_bonus}`} />
          </div>

          {stats.subclass_id && (
            <p className="text-xs text-[#a99d87]">
              <strong className="gold">Podpovolání:</strong> {catalog?.subclasses.find((subclass) => subclass.id === stats.subclass_id)?.name ?? pretty(stats.subclass_id)}
            </p>
          )}

          <div>
            <p className="label gold">Záchranné hody</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
              {Object.entries(stats.saving_throws).map(([ab, val]) => (
                <div key={ab} className={`flex items-center justify-between border px-3 py-2 ${val.proficient ? "border-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] bg-[#22221f]"}`}>
                  <span className={val.proficient ? "gold" : "text-[#a99d87]"}>{pretty(ab)}</span>
                  <span className="font-semibold">{val.total >= 0 ? `+${val.total}` : val.total}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label gold">Získané dovednosti</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {Object.entries(stats.skill_bonuses).filter(([, val]) => val.proficient).map(([skill, val]) => (
                <span key={skill} className="border border-[#d69b4a] bg-[#2e2617] px-2 py-1 gold">
                  {pretty(skill)} {val.total >= 0 ? `+${val.total}` : val.total}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="label gold">Odbornosti, featy a vlastnosti</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {stats.proficiencies.map((p, idx) => (
                <span key={idx} className="border border-[#3b3933] bg-[#22221f] px-2 py-1">{p.name}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#a99d87]">
              <strong className="gold">Origin feat:</strong> {stats.origin_feat}
              {stats.general_feats.length > 0 && <> · <strong className="gold">Obecné featy:</strong> {stats.general_feats.join(", ")}</>}
              {stats.selected_masteries.length > 0 && <> · <strong className="gold">Mistrovství se zbraněmi:</strong> {stats.selected_masteries.map(pretty).join(", ")}</>}
            </p>
            {stats.species_traits.length > 0 && (
              <p className="mt-1 text-xs text-[#a99d87]"><strong className="gold">Vlastnosti druhu:</strong> {stats.species_traits.join(", ")}</p>
            )}
            {stats.class_features.length > 0 && (
              <p className="mt-1 text-xs text-[#a99d87]"><strong className="gold">Schopnosti povolání:</strong> {stats.class_features.join(", ")}</p>
            )}
          </div>

          {stats.spellcasting_stats && (
            <div>
              <p className="label gold">Kouzla</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <Metric name="Atribut" value={pretty(stats.spellcasting_stats.ability)} />
                <Metric name="Záchranné DC" value={stats.spellcasting_stats.save_dc} />
                <Metric name="Útok kouzlem" value={`+${stats.spellcasting_stats.attack_bonus}`} />
                <Metric name="Max. úroveň kouzla" value={stats.spellcasting_stats.max_spell_level} />
              </div>
              {Object.keys(stats.spell_slots).length > 0 && (
                <p className="mt-2 text-xs text-[#a99d87]">
                  <strong className="gold">Sloty kouzel:</strong>{" "}
                  {Object.entries(stats.spell_slots).map(([lvl, count]) => `${lvl}. úroveň ×${count}`).join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="border border-[#3b3933] p-4 bg-[#22221f]">
            <h3 className="label gold">Vypočtený inventář</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {stats.calculated_inventory.map((item, idx) => (
                <span key={idx} className="border border-[#3b3933] px-2 py-1 bg-[#1a1a18]">
                  {item.quantity}× {item.name} ({item.notes})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- PROFILE VIEW ---------------- */

function Profile({
  character,
  catalog,
  onChanged,
  onDeleted,
  onRequestConfirm,
}: {
  character: SavedCharacter;
  catalog: RuleCatalog | null;
  onChanged: (character: SavedCharacter) => void;
  onDeleted: (id: string) => void;
  onRequestConfirm: (dialog: ConfirmDialogState) => void;
}) {
  const { startEdit, setView } = useCharacterStore();
  const [inventory, setInventory] = useState<InventoryItem[]>(character.inventory);
  const [newItemName, setNewItemName] = useState("");
  const [gameplayLevel, setGameplayLevel] = useState(character.level);
  const [xpValue, setXpValue] = useState(character.xp ?? 0);
  const [sessionXp, setSessionXp] = useState(character.session_xp ?? 0);
  const [sessionNote, setSessionNote] = useState(character.session_note ?? "");
  const [lastSession, setLastSession] = useState(character.last_session ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    setGameplayLevel(character.level);
    setXpValue(character.xp ?? 0);
    setSessionXp(character.session_xp ?? 0);
    setSessionNote(character.session_note ?? "");
    setLastSession(character.last_session ?? "");
  }, [character.id, character.level, character.xp, character.session_xp, character.session_note, character.last_session]);

  const deleteCharacter = async () => {
    onRequestConfirm({
      title: "Smazat postavu",
      message: `Opravdu smazat postavu „${character.name}“?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API}/api/characters/${character.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Postavu se nepodařilo smazat.");
          onDeleted(character.id);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Chyba při mazání.");
        }
      },
    });
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    setInventory((items) => [
      ...items,
      {
        id: crypto.randomUUID().slice(0, 8),
        name: newItemName.trim(),
        category: "item",
        quantity: 1,
        notes: "Ručně přidáno",
      },
    ]);
    setNewItemName("");
  };

  const removeItem = (id: string) => {
    setInventory((items) => items.filter((item) => item.id !== id));
  };

  const saveInventory = async () => {
    try {
      const response = await fetch(`${API}/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: character.creation_state, inventory }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Uložení inventáře se nepodařilo.");
      onChanged(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chyba uložení.");
    }
  };

  const updateLevel = async (nextLevel: number) => {
    const boundedLevel = Math.min(20, Math.max(1, nextLevel));
    setGameplayLevel(boundedLevel);

    try {
      const response = await fetch(`${API}/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { ...character.creation_state, level: boundedLevel },
          inventory,
          xp: xpValue,
          session_xp: sessionXp,
          session_note: sessionNote,
          last_session: lastSession,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Úroveň postavy se nepodařila uložit.");
      onChanged(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chyba při změně úrovně.");
    }
  };

  const saveGameplayState = async () => {
    try {
      const response = await fetch(`${API}/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: character.creation_state,
          inventory,
          xp: xpValue,
          session_xp: sessionXp,
          session_note: sessionNote,
          last_session: lastSession,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Uložení herního stavu se nepodařilo.");
      onChanged(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chyba uložení herního stavu.");
    }
  };

  return (
    <Shell
      title={character.name}
      eyebrow={`${pretty(character.species_id)} · ${pretty(character.class_id)} · úroveň ${character.level}`}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => startEdit(character)}
            className="border border-[#d69b4a] px-4 py-2 text-sm text-[#d69b4a] hover:bg-[#d69b4a]/10"
          >
            Upravit postavu
          </button>
          <button
            onClick={() => void deleteCharacter()}
            className="border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300 hover:bg-red-900/60"
          >
            🗑️ Smazat postavu
          </button>
          <button onClick={() => setView("dashboard")} className="label gold px-3 py-2 border border-[#3b3933]">
            Knihovna
          </button>
        </div>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Metric name="HP Max" value={character.max_hp} />
        <Metric name="AC" value={character.armor_class} />
        <Metric name="Prof. Bonus" value={`+${character.proficiency_bonus}`} />
        <Metric name="Pasivní vnímání" value={character.passive_perception} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <section className="panel p-6 space-y-6">
          <div className="border border-[#3b3933] bg-[#1b1714] p-4 shadow-[0_0_0_1px_rgba(216,155,91,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="label gold">Gameplay panel</p>
                <h2 className="mt-1 text-2xl font-semibold">Přehled a level-up</h2>
              </div>
              <div className="rounded border border-[#d69b4a] bg-[#2e2617] px-3 py-1 text-sm font-bold text-[#d69b4a]">
                Úroveň {gameplayLevel}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="border border-[#3b3933] bg-[#1a1a18] p-3">
                <span className="label">HP</span>
                <strong className="mt-1 block text-xl gold">{character.max_hp}</strong>
              </div>
              <div className="border border-[#3b3933] bg-[#1a1a18] p-3">
                <span className="label">AC</span>
                <strong className="mt-1 block text-xl gold">{character.armor_class}</strong>
              </div>
              <div className="border border-[#3b3933] bg-[#1a1a18] p-3">
                <span className="label">Bonus prof.</span>
                <strong className="mt-1 block text-xl gold">+{character.proficiency_bonus}</strong>
              </div>
              <div className="border border-[#3b3933] bg-[#1a1a18] p-3">
                <span className="label">Initiativa</span>
                <strong className="mt-1 block text-xl gold">{character.initiative >= 0 ? `+${character.initiative}` : character.initiative}</strong>
              </div>
            </div>

            <div className="mt-5 border-t border-[#3b3933] pt-4 text-xs text-[#a99d87]">
              <div className="flex items-center justify-between gap-3">
                <p className="label gold">XP a postup</p>
                <span className="gold font-semibold">{xpValue} XP</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden bg-[#1a1a18]">
                <div
                  className="h-full bg-gradient-to-r from-[#b87443] to-[#f6b56a]"
                  style={{ width: `${Math.min(100, (xpValue / 355000) * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-[#a99d87]">
                <span>lvl {gameplayLevel}</span>
                <span>{xpValue} / 355000</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => void updateLevel(gameplayLevel - 1)}
                className="border border-[#3b3933] px-3 py-2 text-xs text-[#a99d87]"
              >
                −1 úroveň
              </button>
              <button
                onClick={() => void updateLevel(gameplayLevel + 1)}
                className="bg-[#d69b4a] px-3 py-2 text-xs font-bold text-[#281b0d]"
              >
                +1 úroveň
              </button>
              <button
                onClick={() => void saveGameplayState()}
                className="border border-[#d69b4a] bg-[#201a16] px-3 py-2 text-xs font-semibold text-[#f1c285]"
              >
                Uložit stav
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric name="Povolání" value={pretty(character.class_id)} />
            <Metric name="Druh" value={pretty(character.species_id)} />
            <Metric name="Původ" value={pretty(character.background_id)} />
            <Metric name="Přesvědčení" value={character.details.alignment || "—"} />
          </div>

          <div>
            <p className="label gold">Atributy a modifikátory</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {abilities.map((ab) => (
                <div key={ab} className="border border-[#3b3933] p-3 text-center bg-[#22221f]">
                  <span className="label text-xs">{labels[ab]}</span>
                  <strong className="block text-2xl mt-1">{character.final_ability_scores[ab]}</strong>
                  <span className="gold text-sm font-semibold">
                    {character.modifiers[ab] >= 0 ? `+${character.modifiers[ab]}` : character.modifiers[ab]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label gold">Popis a historie</p>
            <p className="mt-2 text-sm text-[#a99d87] border border-[#3b3933] p-3 bg-[#22221f]">
              {character.details.description || "Žádný osobní popis nezadán."}
            </p>
          </div>

          <div className="border border-[#3b3933] bg-[#1a1715] p-4">
            <p className="label gold">Session tracking</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <label className="block">
                <span className="label">XP za session</span>
                <input
                  type="number"
                  min={0}
                  value={sessionXp}
                  onChange={(event) => setSessionXp(Number(event.target.value) || 0)}
                  className="mt-2 block w-full border border-[#3b3933] bg-[#141311] p-2"
                />
              </label>
              <label className="block">
                <span className="label">Celkem XP</span>
                <input
                  type="number"
                  min={0}
                  value={xpValue}
                  onChange={(event) => setXpValue(Number(event.target.value) || 0)}
                  className="mt-2 block w-full border border-[#3b3933] bg-[#141311] p-2"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="label">Poslední session</span>
              <input
                type="date"
                value={lastSession}
                onChange={(event) => setLastSession(event.target.value)}
                className="mt-2 block w-full border border-[#3b3933] bg-[#141311] p-2"
              />
            </label>
            <label className="mt-3 block">
              <span className="label">Poznámka k session</span>
              <textarea
                value={sessionNote}
                onChange={(event) => setSessionNote(event.target.value)}
                className="mt-2 block min-h-[90px] w-full border border-[#3b3933] bg-[#141311] p-2 text-sm"
                placeholder="Co se stalo, co se rozšířilo, co je potřeba v další session..."
              />
            </label>
          </div>

          <div>
            <p className="label gold">Záchranné hody</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(character.saving_throws ?? {}).map(([ab, val]) => (
                <div key={ab} className={`flex items-center justify-between border px-3 py-2 ${val.proficient ? "border-[#d69b4a] bg-[#2e2617]" : "border-[#3b3933] bg-[#22221f]"}`}>
                  <span className={val.proficient ? "gold" : "text-[#a99d87]"}>{pretty(ab)}</span>
                  <span className="font-semibold">{val.total >= 0 ? `+${val.total}` : val.total}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label gold">Dovednosti</p>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {Object.entries(character.skill_bonuses ?? {})
                .filter(([, val]) => val.proficient)
                .map(([skill, val]) => (
                  <div key={skill} className="flex items-center justify-between border border-[#d69b4a] bg-[#2e2617] px-2 py-1">
                    <span className="gold">{pretty(skill)}</span>
                    <span className="font-semibold">{val.total >= 0 ? `+${val.total}` : val.total}</span>
                  </div>
                ))}
              {Object.values(character.skill_bonuses ?? {}).every((val) => !val.proficient) && (
                <span className="text-[#a99d87] col-span-2">Žádné dovednosti nejsou vybrány.</span>
              )}
            </div>
          </div>

          <div>
            <p className="label gold">Odbornosti (zbraně, zbroj, nástroje)</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {(character.proficiencies ?? []).map((p, idx) => (
                <span key={idx} className="border border-[#3b3933] bg-[#22221f] px-2 py-1">
                  {p.name} <span className="text-[#a99d87]">({p.type})</span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="label gold">Featy, mistrovství se zbraněmi a vlastnosti druhu</p>
            <p className="mt-2 text-xs text-[#a99d87]">
              <strong className="gold">Origin feat:</strong> {character.origin_feat || "žádný"}
            </p>
            {character.selected_masteries?.length > 0 && (
              <p className="mt-1 text-xs text-[#a99d87]">
                <strong className="gold">Mistrovství se zbraněmi:</strong> {character.selected_masteries.map(pretty).join(", ")}
              </p>
            )}
            {character.species_traits?.length > 0 && (
              <p className="mt-1 text-xs text-[#a99d87]">
                <strong className="gold">Vlastnosti druhu:</strong> {character.species_traits.join(", ")}
              </p>
            )}
            {(character.general_feats?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs text-[#a99d87]">
                <strong className="gold">Obecné featy:</strong> {character.general_feats.join(", ")}
              </p>
            )}
          </div>

          {character.class_features?.length > 0 && (
            <div>
              <p className="label gold">Schopnosti povolání</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {character.class_features.map((feature, idx) => (
                  <span key={idx} className="border border-[#3b3933] bg-[#22221f] px-2 py-1">{feature}</span>
                ))}
              </div>
            </div>
          )}

          {character.spellcasting_stats && (
            <div>
              <p className="label gold">Spellcasting</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <Metric name="Atribut" value={pretty(character.spellcasting_stats.ability)} />
                <Metric name="Save DC" value={character.spellcasting_stats.save_dc} />
                <Metric name="Útok kouzlem" value={`+${character.spellcasting_stats.attack_bonus}`} />
                <Metric name="Max. úroveň kouzla" value={character.spellcasting_stats.max_spell_level} />
              </div>
              {Object.keys(character.spell_slots ?? {}).length > 0 && (
                <p className="mt-2 text-xs text-[#a99d87]">
                  <strong className="gold">Spell sloty:</strong>{" "}
                  {Object.entries(character.spell_slots).map(([lvl, count]) => `${lvl}. úroveň ×${count}`).join(", ")}
                </p>
              )}
            </div>
          )}

          {character.creation_state.selected_spells && character.creation_state.selected_spells.length > 0 && (
            <div>
              <p className="label gold">Kouzla postavy ({character.creation_state.selected_spells.length})</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {character.creation_state.selected_spells.map((spellId) => {
                  const spell = catalog?.spells.find((s) => s.id === spellId);
                  return (
                    <div key={spellId} className="border border-[#3b3933] p-2 bg-[#22221f] text-xs">
                      <strong className="gold block text-sm">{spell?.name ?? pretty(spellId)}</strong>
                      <span className="text-[10px] text-[#a99d87] block">
                        {spell ? (spell.level === 0 ? "Cantrip" : `${spell.level}. úroveň · ${spell.school}`) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-6 lg:col-span-2">
          <p className="label gold">Praktické vysvětlivky při hraní</p>
          <h2 className="mt-1 text-2xl font-semibold">Jak postava funguje ve hře</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="border border-[#3b3933] bg-[#22221f] p-4">
              <p className="label gold">Origin</p>
              <p className="mt-2 text-sm text-[#a99d87]">
                <strong className="gold">{character.origin_feat || "Žádný origin feat"}</strong> je tvůj bonus z původu a pozadí. Většinou posiluje jednu zásadní vlastnost postavy, přístup k dovednosti nebo jiný praktický efekt. Při hraní se vždy podívej, zda tvůj origin nevyžaduje zvláštní akci, hod nebo pravidlo v dané situaci.
              </p>
            </div>

            <div className="border border-[#3b3933] bg-[#22221f] p-4">
              <p className="label gold">Útoky</p>
              <p className="mt-2 text-sm text-[#a99d87]">
                Na útok házíš <strong className="gold">1d20</strong> + bonus proficience + modifikátor zbraně. Pokud je zbraň nebo schopnost vhodná pro tvůj atribut, přičítá se právě ten modifikátor. Poškození se pak řeší zvlášť: kostka zbraně + modifikátor, podle typu útoku a zbraně.
              </p>
            </div>

            <div className="border border-[#3b3933] bg-[#22221f] p-4">
              <p className="label gold">Magie</p>
              <p className="mt-2 text-sm text-[#a99d87]">
                Pro kouzla se používá <strong className="gold">Save DC</strong> = 8 + bonus proficience + modifikátor kouzelnického atributu. K útoku kouzlem se přičítá bonus proficience + modifikátor atributu. Když kouzlo ovlivňuje cíl, hází se většinou na záchranný hod nebo na útok podle textu kouzla.
              </p>
            </div>

            <div className="border border-[#3b3933] bg-[#22221f] p-4">
              <p className="label gold">Poškození</p>
              <p className="mt-2 text-sm text-[#a99d87]">
                Základní vzorec je <strong className="gold">kostka poškození + modifikátor</strong>. U zbraní typicky přidáváš sílu nebo obratnost podle zbraně, u kouzel zase příslušný magický atribut. Vždy si ověř, zda je zbraň nebo magický efekt <em>vhodný pro danou situaci</em> a zda nepřidává zvláštní úpravu poškození.
              </p>
            </div>
          </div>

          <div className="mt-5 border border-[#3b3933] bg-[#1a1a18] p-4 text-sm text-[#a99d87]">
            <p className="label gold">Rychlý přehled pro hru</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Útok: 1d20 + bonus proficience + relevantní modifikátor.</li>
              <li>Poškození: kostka zbraně/kouzla + modifikátor, podle typu útoku.</li>
              <li>Save DC: 8 + bonus proficience + kouzelnický atribut.</li>
              <li>Výhody a nevýhody při hodu se vždy aplikují před výsledkem.</li>
            </ul>
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="label gold">Správa inventáře</p>
              <h2 className="mt-1 text-2xl font-semibold">Vybavení postavy</h2>
            </div>
            <button onClick={() => void saveInventory()} className="bg-[#d69b4a] px-3 py-1 text-xs font-bold text-[#281b0d]">
              Uložit inventář
            </button>
          </div>

              {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

          <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] text-[#a99d87]">
            <div className="border border-[#3b3933] bg-[#22221f] p-2">
              <span className="label">Předměty</span>
              <strong className="mt-1 block text-sm gold">{inventory.length}</strong>
            </div>
            <div className="border border-[#3b3933] bg-[#22221f] p-2">
              <span className="label">Kouzla</span>
              <strong className="mt-1 block text-sm gold">{character.creation_state.selected_spells.length}</strong>
            </div>
          </div>

          <div className="mt-5 space-y-2 max-h-96 overflow-y-auto pr-1">
            {inventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-[#3b3933] py-2 text-sm">
                <div>
                  <strong>{item.name}</strong>
                  <span className="block text-[10px] text-[#a99d87]">{item.notes}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="label">{item.quantity}×</span>
                  <button onClick={() => removeItem(item.id)} className="text-xs text-red-400">✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="flex-1 border border-[#3b3933] bg-[#22221f] p-2 text-sm"
              placeholder="Přidat nový předmět..."
            />
            <button onClick={addItem} className="border border-[#d69b4a] px-4 py-2 text-sm text-[#d69b4a]">
              + Přidat
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
