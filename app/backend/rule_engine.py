import json
import math
import os
from pathlib import Path
from typing import Any

from .schemas import Ability, AbilityScores, CharacterCreationState, DerivedStats, InventoryItem


def _resolve_rules_root() -> Path:
    env_root = os.getenv("RULES_ROOT")
    if env_root:
        return Path(env_root)

    candidates = [
        Path("/app/data/rules"),
        Path("/data/rules"),
        Path(__file__).resolve().parents[2] / "data" / "rules",
        Path(__file__).resolve().parents[1] / "data" / "rules",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return Path("/app/data/rules")


ABILITY_NAMES = tuple(Ability)
DEFAULT_RULES_ROOT = _resolve_rules_root()
XP_LEVELS = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
    305000, 355000,
]

FULL_CASTER_SLOTS = {
    1: {1: 2}, 2: {1: 3}, 3: {1: 4, 2: 2}, 4: {1: 4, 2: 3},
    5: {1: 4, 2: 3, 3: 2}, 6: {1: 4, 2: 3, 3: 3},
    7: {1: 4, 2: 3, 3: 3, 4: 1}, 8: {1: 4, 2: 3, 3: 3, 4: 2},
    9: {1: 4, 2: 3, 3: 3, 4: 3, 5: 1}, 10: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2},
    11: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1}, 12: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1},
    13: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1}, 14: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1},
    15: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1}, 16: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1},
    17: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1}, 18: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1},
    19: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1}, 20: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1},
}


SKILL_ABILITIES: dict[str, Ability] = {
    "acrobatics": Ability.dexterity,
    "animal handling": Ability.wisdom,
    "arcana": Ability.intelligence,
    "athletics": Ability.strength,
    "deception": Ability.charisma,
    "history": Ability.intelligence,
    "insight": Ability.wisdom,
    "intimidation": Ability.charisma,
    "investigation": Ability.intelligence,
    "medicine": Ability.wisdom,
    "nature": Ability.intelligence,
    "perception": Ability.wisdom,
    "performance": Ability.charisma,
    "persuasion": Ability.charisma,
    "religion": Ability.intelligence,
    "sleight of hand": Ability.dexterity,
    "stealth": Ability.dexterity,
    "survival": Ability.wisdom,
}

HALF_CASTER_SLOTS = {
    1: {1: 2}, 2: {1: 2}, 3: {1: 3}, 4: {1: 3},
    5: {1: 4, 2: 2}, 6: {1: 4, 2: 2}, 7: {1: 4, 2: 3}, 8: {1: 4, 2: 3},
    9: {1: 4, 2: 3, 3: 2}, 10: {1: 4, 2: 3, 3: 2}, 11: {1: 4, 2: 3, 3: 3}, 12: {1: 4, 2: 3, 3: 3},
    13: {1: 4, 2: 3, 3: 3, 4: 1}, 14: {1: 4, 2: 3, 3: 3, 4: 1}, 15: {1: 4, 2: 3, 3: 3, 4: 2}, 16: {1: 4, 2: 3, 3: 3, 4: 2},
    17: {1: 4, 2: 3, 3: 3, 4: 3, 5: 1}, 18: {1: 4, 2: 3, 3: 3, 4: 3, 5: 1}, 19: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2}, 20: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2},
}

PACT_MAGIC_SLOTS = {
    1: {1: 1}, 2: {1: 2}, 3: {2: 2}, 4: {2: 2},
    5: {3: 2}, 6: {3: 2}, 7: {4: 2}, 8: {4: 2},
    9: {5: 2}, 10: {5: 2}, 11: {5: 3}, 12: {5: 3},
    13: {5: 3}, 14: {5: 3}, 15: {5: 3}, 16: {5: 3},
    17: {5: 4}, 18: {5: 4}, 19: {5: 4}, 20: {5: 4},
}


def _load_rule(category: str, identifier: str, rules_root: Path) -> dict:
    path = rules_root / category / f"{identifier}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Unknown {category[:-1]}: {identifier}") from error


def _load_catalog(filename: str, rules_root: Path) -> Any:
    return json.loads((rules_root / filename).read_text(encoding="utf-8"))


def get_level_from_xp(xp: int) -> int:
    level = 1
    for index, threshold in enumerate(XP_LEVELS[1:], start=2):
        if xp < threshold:
            return min(level, 20)
        level = index
    return 20


def get_next_level_xp(level: int) -> int:
    if level < 1:
        return 0
    if level >= 20:
        return 0
    return XP_LEVELS[level]


def _modifier(score: int) -> int:
    return math.floor((score - 10) / 2)


def _validate_boosts(boosts: dict[Ability, int], allowed: list[str]) -> None:
    if not boosts:
        return
    if any(ability.value not in allowed for ability in boosts):
        raise ValueError("Vybral jsi špatně zvýšení atributů. Vyber pouze jeden +2 a jeden +1.")
    values = sorted(boosts.values())
    if len(boosts) != 2 or values != [1, 2]:
        raise ValueError("Vybral jsi špatně zvýšení atributů. Vyber pouze jeden +2 a jeden +1.")


def _weapon_has_property(weapon: dict[str, Any], property_name: str) -> bool:
    return any(str(prop).lower() == property_name.lower() for prop in weapon.get("properties", []))


def _is_weapon_trained_for_class(class_rule: dict[str, Any], weapon: dict[str, Any], class_id: str) -> bool:
    category = str(weapon.get("category", "")).lower()
    proficiencies = [str(item).lower() for item in class_rule.get("proficiencies", [])]

    if category.startswith("simple"):
        return "simple weapons" in proficiencies

    if category.startswith("martial"):
        if "martial weapons" in proficiencies:
            restriction = class_rule.get("martial_restriction") or class_rule.get("martialRestriction")
            if restriction is None:
                return True
            props = [str(prop).lower() for prop in weapon.get("properties", [])]
            if restriction == "light":
                return "light" in props
            if restriction == "finesseOrLight":
                return "finesse" in props or "light" in props
            return False

        if class_id == "rogue":
            weapon_id = str(weapon.get("id", "")).lower()
            allowed_rogue_weapons = {"hand-crossbow", "longsword", "rapier", "shortsword"}
            if weapon_id in allowed_rogue_weapons:
                return True
            return any(str(prop).lower() in {"finesse", "light"} for prop in weapon.get("properties", []))

        if class_id == "monk":
            return False

    return False


def calculate_stats(state: CharacterCreationState, rules_root: Path = DEFAULT_RULES_ROOT) -> DerivedStats:
    class_rule = _load_rule("classes", state.class_id, rules_root)
    background_rule = _load_rule("backgrounds", state.background_id, rules_root)
    species_rule = _load_rule("species", state.species_id, rules_root)
    creation_rules = json.loads((rules_root / "character-creation.json").read_text(encoding="utf-8"))

    # Skill validation
    skill_rule = creation_rules["skill_choices"].get(state.class_id, {"count": 2, "options": []})
    class_skills_count = skill_rule["count"]
    if state.selected_skills:
        if len(set(state.selected_skills)) != len(state.selected_skills):
            raise ValueError("Selected skills must be unique")
        if len(state.selected_skills) > class_skills_count:
            raise ValueError(f"Choose at most {class_skills_count} class skills")
        for skill in state.selected_skills:
            if skill not in skill_rule["options"]:
                raise ValueError(f"Skill '{skill}' is not in allowed class skill options")

    # Background boost validation
    _validate_boosts(state.background_boosts, background_rule["allowed_ability_boosts"])

    # Weapon mastery validation
    if len(set(state.selected_masteries)) != len(state.selected_masteries):
        raise ValueError("Weapon masteries must be unique")
    if len(state.selected_masteries) > class_rule["weapon_mastery_count"]:
        raise ValueError("Too many weapon masteries selected for this class")

    # Armor & Shield proficiency validation
    trained_armor = class_rule.get("armor_training", [])
    if state.armor.category != "unarmored" and state.armor.category not in trained_armor:
        raise ValueError(f"{class_rule['name']} is not trained in {state.armor.category} armor")

    # Shields are allowed to be equipped even when a class is not trained with them,
    # but the shield bonus does not apply unless the class explicitly grants shield training.

    # General feat validation (Ability Score Improvement slots at levels 4, 8, 12, 16, 19)
    if len(set(state.general_feats)) != len(state.general_feats):
        raise ValueError("General feats must be unique")
    general_feat_slots = len([lvl for lvl in (4, 8, 12, 16, 19) if state.level >= lvl])
    if len(state.general_feats) > general_feat_slots:
        raise ValueError(f"Choose at most {general_feat_slots} general feats for a level {state.level} character")
    feat_names = {feat["name"] for feat in _load_catalog("feats.json", rules_root)}
    for feat_name in state.general_feats:
        if feat_name not in feat_names:
            raise ValueError(f"Unknown feat: {feat_name}")
        if feat_name == background_rule.get("origin_feat"):
            raise ValueError(f"'{feat_name}' is already granted by the background and cannot be picked again")

    # Weapons & Spells validation
    weapons_catalog = _load_catalog("weapons.json", rules_root)
    weapon_map = {weapon["id"]: weapon for weapon in weapons_catalog}
    if any(weapon_id not in weapon_map for weapon_id in state.selected_weapons):
        raise ValueError("Selected weapon does not exist in rules catalog")
    for weapon_id in state.selected_weapons:
        weapon = weapon_map[weapon_id]
        if not _is_weapon_trained_for_class(class_rule, weapon, state.class_id):
            raise ValueError(f"{class_rule['name']} is not trained with weapon '{weapon['name']}'")

    spell_files = sorted((rules_root / "spells").glob("*.json"))
    spell_ids = {spell["id"]: spell for spell in (_load_catalog(f"spells/{path.name}", rules_root) for path in spell_files)}
    if len(set(state.selected_spells)) != len(state.selected_spells):
        raise ValueError("Selected spells must be unique")

    spellcasting_rules = _load_catalog("spellcasting.json", rules_root)
    spellcasting_rule = spellcasting_rules.get(state.class_id)
    if state.selected_spells and spellcasting_rule is None:
        raise ValueError("This class cannot select spells")

    if spellcasting_rule:
        cantrip_ids = {spell_id for spell_id in state.selected_spells if spell_ids.get(spell_id, {}).get("level") == 0}
        leveled_ids = {spell_id for spell_id in state.selected_spells if spell_ids.get(spell_id, {}).get("level", 0) > 0}
        
        # Cantrip limit for level 1-20
        base_cantrips = spellcasting_rule.get("cantrips_level_1", 0)
        if base_cantrips > 0:
            cantrips_limit = base_cantrips + (1 if state.level >= 4 else 0) + (1 if state.level >= 10 else 0)
        else:
            cantrips_limit = 0

        # Max spell level & Prepared/Known spells limit for level 1-20
        spellcasting_type = class_rule.get("spellcasting", "none")
        if spellcasting_type == "full":
            leveled_limit = min(22, state.level + (3 if state.class_id in ("bard", "druid") else 4))
            max_spell_level = min(9, math.ceil(state.level / 2))
        elif spellcasting_type == "half":
            leveled_limit = min(15, math.floor(state.level / 2) + 1)
            max_spell_level = min(5, math.ceil(state.level / 4))
        elif spellcasting_type == "pact":
            leveled_limit = min(15, state.level + 1)
            max_spell_level = min(5, math.ceil(state.level / 2))
        else:
            leveled_limit = 4
            max_spell_level = 1

        for spell_id in state.selected_spells:
            spell = spell_ids.get(spell_id)
            if spell and spell["level"] > max_spell_level:
                raise ValueError(f"Kouzlo '{spell['name']}' ({spell['level']}. úroveň) přesahuje maximální úroveň kouzel ({max_spell_level}. úroveň) pro {state.level}. úroveň postavy")

        if len(cantrip_ids) > cantrips_limit:
            raise ValueError(f"Maximálně {cantrips_limit} cantripů je povoleno pro {class_rule['name']} na {state.level}. úrovni")
        if len(leveled_ids) > leveled_limit:
            raise ValueError(f"Maximálně {leveled_limit} připravených/známých kouzel je povoleno pro {class_rule['name']} na {state.level}. úrovni")

    # Scores & Modifiers
    scores = state.base_scores.model_dump()
    for ability, boost in state.background_boosts.items():
        scores[ability.value] += boost
    final_scores = AbilityScores(**scores)
    modifiers = {ability: _modifier(getattr(final_scores, ability.value)) for ability in ABILITY_NAMES}

    # Proficiency bonus & Level progression
    proficiency_bonus = 2 + (state.level - 1) // 4
    all_class_levels = _load_catalog("class-levels.json", rules_root).get(state.class_id, {})
    subclasses_catalog = _load_catalog("subclasses.json", rules_root)
    subclass_record = next((entry for entry in subclasses_catalog if entry.get("id") == state.subclass_id), None)
    if state.subclass_id and subclass_record is None:
        raise ValueError(f"Vybrané podpovolání '{state.subclass_id}' neexistuje v katalogu pravidel.")
    if state.subclass_id and subclass_record and subclass_record.get("class_id") != state.class_id:
        raise ValueError(f"Podpovolání '{subclass_record.get('name', state.subclass_id)}' nepatří k povolání {class_rule['name']}.")
    if state.subclass_id and state.level < class_rule["subclass_level"]:
        raise ValueError(f"Subclass selection available at level {class_rule['subclass_level']}")

    class_features: list[str] = []
    for lvl in range(1, state.level + 1):
        features_at_lvl = all_class_levels.get(str(lvl), [])
        class_features.extend(features_at_lvl)
    if subclass_record:
        class_features.append(subclass_record.get("name", "Subclass"))
        class_features.extend(subclass_record.get("features", []))

    species_traits = list(species_rule.get("traits", []))
    if state.species_choices:
        for opt_id, choice_val in state.species_choices.items():
            species_traits.append(f"{opt_id}: {choice_val}")

    # Max HP
    hit_die = class_rule["hit_die"]
    fixed_level_one = hit_die
    later_level_hp = max(0, state.level - 1) * (hit_die // 2 + 1)
    dwarf_bonus = 1 * state.level if state.species_id == "dwarf" else 0
    max_hp = max(1, fixed_level_one + modifiers[Ability.constitution] + later_level_hp + (modifiers[Ability.constitution] * max(0, state.level - 1)) + dwarf_bonus)

    # Armor Class
    dexterity_modifier = modifiers[Ability.dexterity]
    if state.armor.category == "unarmored":
        if state.class_id == "barbarian":
            ac_base = 10 + dexterity_modifier + modifiers[Ability.constitution]
        elif state.class_id == "monk":
            ac_base = 10 + dexterity_modifier + modifiers[Ability.wisdom] if not state.shield else 10 + dexterity_modifier
        else:
            ac_base = 10 + dexterity_modifier
    else:
        armor_dex = min(dexterity_modifier, state.armor.dexterity_cap) if state.armor.dexterity_cap is not None else dexterity_modifier
        ac_base = state.armor.base_ac + armor_dex

    armor_class = ac_base + (2 if state.shield and "shields" in trained_armor else 0)

    # Initiative
    initiative = modifiers[Ability.dexterity]

    # Passive Perception
    all_proficient_skills = set(state.selected_skills + background_rule.get("skills", []))
    if state.proficient_perception:
        all_proficient_skills.add("perception")
    passive_perception = 10 + modifiers[Ability.wisdom] + (proficiency_bonus if "perception" in all_proficient_skills else 0)

    # Saving Throws
    class_saves = [Ability(s) for s in class_rule.get("saving_throws", [])]
    saving_throws: dict[str, dict[str, Any]] = {}
    for ab in ABILITY_NAMES:
        is_prof = ab in class_saves
        bonus = modifiers[ab] + (proficiency_bonus if is_prof else 0)
        saving_throws[ab.value] = {
            "modifier": modifiers[ab],
            "proficient": is_prof,
            "total": bonus,
            "source": f"Class ({class_rule['name']})" if is_prof else "Base",
        }

    # Skill Bonuses
    skill_bonuses: dict[str, dict[str, Any]] = {}
    for skill, ab in SKILL_ABILITIES.items():
        is_prof = skill in all_proficient_skills
        bonus = modifiers[ab] + (proficiency_bonus if is_prof else 0)
        source = "Background" if skill in background_rule.get("skills", []) else "Class" if skill in state.selected_skills else "None"
        skill_bonuses[skill] = {
            "ability": ab.value,
            "modifier": modifiers[ab],
            "proficient": is_prof,
            "total": bonus,
            "source": source,
        }

    # Spellcasting Stats
    spellcasting_type = class_rule.get("spellcasting", "none")
    spellcasting_stats: dict[str, Any] | None = None
    spell_slots: dict[int, int] = {}

    if spellcasting_type != "none" and spellcasting_rule:
        casting_ab_name = spellcasting_rule["ability"]
        casting_ab = Ability(casting_ab_name)
        casting_mod = modifiers[casting_ab]
        save_dc = 8 + proficiency_bonus + casting_mod
        attack_bonus = proficiency_bonus + casting_mod

        if spellcasting_type == "full":
            spell_slots = FULL_CASTER_SLOTS.get(state.level, {})
        elif spellcasting_type == "half":
            spell_slots = HALF_CASTER_SLOTS.get(state.level, {})
        elif spellcasting_type == "pact":
            spell_slots = PACT_MAGIC_SLOTS.get(state.level, {})

        spellcasting_stats = {
            "ability": casting_ab_name,
            "modifier": casting_mod,
            "save_dc": save_dc,
            "attack_bonus": attack_bonus,
            "cantrips_known": cantrips_limit,
            "prepared_spells": leveled_limit,
            "max_spell_level": max_spell_level,
        }

    # Starting Equipment Inventory Aggregation
    starting_eq_catalog = _load_catalog("starting-equipment.json", rules_root)
    calculated_inventory: list[InventoryItem] = []

    # Process class equipment choices
    class_eq_groups = starting_eq_catalog.get("class_equipment", {}).get(state.class_id, [])
    for group in class_eq_groups:
        group_id = group["groupId"]
        selected_option_id = state.equipment_choices.get(group_id) or (state.starting_equipment_choices.get(group_id, [None])[0])
        if not selected_option_id and group.get("required") and group.get("options"):
            selected_option_id = group["options"][0]["optionId"]

        if selected_option_id:
            for option in group["options"]:
                if option["optionId"] == selected_option_id:
                    for item in option.get("items", []):
                        calculated_inventory.append(
                            InventoryItem(
                                name=item["name"],
                                category=item["category"],
                                quantity=item["quantity"],
                                notes=f"Starting Equipment ({group['label']})",
                            )
                        )

    # Process background equipment choices
    bg_eq_groups = starting_eq_catalog.get("background_equipment", {}).get(state.background_id, [])
    for group in bg_eq_groups:
        group_id = group["groupId"]
        selected_option_id = state.equipment_choices.get(group_id) or (state.starting_equipment_choices.get(group_id, [None])[0])
        if not selected_option_id and group.get("options"):
            selected_option_id = group["options"][0]["optionId"]

        if selected_option_id:
            for option in group["options"]:
                if option["optionId"] == selected_option_id:
                    for item in option.get("items", []):
                        calculated_inventory.append(
                            InventoryItem(
                                name=item["name"],
                                category=item["category"],
                                quantity=item["quantity"],
                                notes=f"Background ({background_rule['name']})",
                            )
                        )

    # Proficiencies summary list
    proficiencies: list[dict[str, str]] = [
        {"name": f"{ab.value.capitalize()} Saving Throws", "type": "saving_throw", "source": class_rule["name"]}
        for ab in class_saves
    ]
    for skill in all_proficient_skills:
        proficiencies.append({"name": skill.capitalize(), "type": "skill", "source": "Class/Background"})
    for armor_type in class_rule.get("armor_training", []):
        proficiencies.append({"name": armor_type.capitalize(), "type": "armor", "source": class_rule["name"]})
    for weapon_prof in class_rule.get("proficiencies", []):
        proficiencies.append({"name": weapon_prof, "type": "weapon", "source": class_rule["name"]})
    if background_rule.get("tool"):
        proficiencies.append({"name": background_rule["tool"], "type": "tool", "source": background_rule["name"]})

    return DerivedStats(
        final_scores=final_scores,
        modifiers=modifiers,
        proficiency_bonus=proficiency_bonus,
        max_hp=max_hp,
        armor_class=armor_class,
        initiative=initiative,
        passive_perception=passive_perception,
        selected_masteries=list(state.selected_masteries),
        spell_slots=spell_slots,
        spellcasting_stats=spellcasting_stats,
        origin_feat=background_rule["origin_feat"],
        general_feats=list(state.general_feats),
        selected_languages=list(state.selected_languages),
        subclass_id=state.subclass_id,
        saving_throws=saving_throws,
        skill_bonuses=skill_bonuses,
        proficiencies=proficiencies,
        class_features=class_features,
        species_traits=species_traits,
        calculated_inventory=calculated_inventory,
    )
