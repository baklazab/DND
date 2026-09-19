from enum import Enum
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4
from pydantic import BaseModel, Field, model_validator


class Ability(str, Enum):
    strength = "strength"
    dexterity = "dexterity"
    constitution = "constitution"
    intelligence = "intelligence"
    wisdom = "wisdom"
    charisma = "charisma"


class AbilityMethod(str, Enum):
    point_buy = "point_buy"
    standard_array = "standard_array"
    rolls = "rolls"
    manual = "manual"


class AbilityScores(BaseModel):
    strength: int = Field(ge=1, le=20)
    dexterity: int = Field(ge=1, le=20)
    constitution: int = Field(ge=1, le=20)
    intelligence: int = Field(ge=1, le=20)
    wisdom: int = Field(ge=1, le=20)
    charisma: int = Field(ge=1, le=20)


class Armor(BaseModel):
    base_ac: int = Field(default=10, ge=0, le=30)
    dexterity_cap: int | None = Field(default=None, ge=0, le=10)
    category: Literal["unarmored", "light", "medium", "heavy"] = "unarmored"


class CharacterDetails(BaseModel):
    name: str = Field(default="", max_length=80)
    alignment: str = Field(default="Unaligned", max_length=40)
    description: str = Field(default="", max_length=2000)


class CharacterCreationState(BaseModel):
    class_id: str = "fighter"
    species_id: str = "human"
    background_id: str = "soldier"
    level: int = Field(default=1, ge=1, le=20)
    ability_method: AbilityMethod = AbilityMethod.point_buy
    base_scores: AbilityScores = Field(default_factory=lambda: AbilityScores(
        strength=15, dexterity=14, constitution=13,
        intelligence=12, wisdom=10, charisma=8,
    ))
    background_boosts: dict[Ability, int] = Field(default_factory=dict)
    species_choices: dict[str, str] = Field(default_factory=dict)
    equipment_choices: dict[str, str] = Field(default_factory=dict)
    rolled_scores: list[int] = Field(default_factory=list)
    selected_masteries: list[Literal["push", "slow", "vex", "graze", "cleave", "nick", "sap", "topple"]] = Field(default_factory=list)
    selected_weapons: list[str] = Field(default_factory=list)
    starting_equipment_choices: dict[str, list[str]] = Field(default_factory=dict)
    selected_spells: list[str] = Field(default_factory=list)
    selected_skills: list[str] = Field(default_factory=list)
    armor: Armor = Field(default_factory=Armor)
    shield: bool = False
    proficient_perception: bool = False
    subclass_id: str | None = None
    selected_languages: list[str] = Field(default_factory=list)
    general_feats: list[str] = Field(default_factory=list)
    details: CharacterDetails = Field(default_factory=CharacterDetails)

    @model_validator(mode="after")
    def validate_ability_method(self):
        scores = list(self.base_scores.model_dump().values())
        if self.ability_method is AbilityMethod.point_buy:
            if any(score < 8 or score > 15 for score in scores):
                raise ValueError("Point Buy scores must be between 8 and 15")
            point_cost = sum(0 if score <= 8 else score - 8 + max(0, score - 13) for score in scores)
            if point_cost != 27:
                raise ValueError("Point Buy must spend exactly 27 points")
        elif self.ability_method is AbilityMethod.standard_array and sorted(scores, reverse=True) != [15, 14, 13, 12, 10, 8]:
            raise ValueError("Standard Array must use 15, 14, 13, 12, 10, and 8")
        elif self.ability_method is AbilityMethod.rolls:
            if any(score < 3 or score > 18 for score in scores):
                raise ValueError("Rolled scores must be between 3 and 18")
        return self

    @model_validator(mode="after")
    def validate_background_boosts(self):
        boosts = list(self.background_boosts.values())
        if boosts and sorted(boosts) not in ([1, 1, 1], [1, 2]):
            raise ValueError("Background boosts must be +2/+1 or +1/+1/+1")
        return self


class InventoryItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    name: str = Field(min_length=1, max_length=120)
    category: Literal["weapon", "armor", "item", "currency"] = "item"
    quantity: int = Field(default=1, ge=0)
    notes: str = Field(default="", max_length=500)


class DerivedStats(BaseModel):
    final_scores: AbilityScores
    modifiers: dict[Ability, int]
    proficiency_bonus: int
    max_hp: int
    armor_class: int
    initiative: int
    passive_perception: int
    selected_masteries: list[str]
    spell_slots: dict[int, int]
    spellcasting_stats: dict[str, Any] | None = None
    origin_feat: str
    general_feats: list[str]
    selected_languages: list[str]
    subclass_id: str | None
    saving_throws: dict[str, dict[str, Any]] = Field(default_factory=dict)
    skill_bonuses: dict[str, dict[str, Any]] = Field(default_factory=dict)
    proficiencies: list[dict[str, str]] = Field(default_factory=list)
    class_features: list[str] = Field(default_factory=list)
    species_traits: list[str] = Field(default_factory=list)
    calculated_inventory: list[InventoryItem] = Field(default_factory=list)


class CharacterRecord(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=80)
    species_id: str
    class_id: str
    background_id: str
    level: int = Field(ge=1, le=20)
    base_ability_scores: AbilityScores
    background_ability_boosts: dict[Ability, int]
    final_ability_scores: AbilityScores
    max_hp: int = Field(ge=1)
    armor_class: int = Field(ge=0)
    proficiency_bonus: int = Field(ge=2)
    modifiers: dict[Ability, int]
    initiative: int
    passive_perception: int
    inventory: list[InventoryItem] = Field(default_factory=list)
    details: CharacterDetails = Field(default_factory=CharacterDetails)
    creation_state: CharacterCreationState
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    saving_throws: dict[str, dict[str, Any]] = Field(default_factory=dict)
    skill_bonuses: dict[str, dict[str, Any]] = Field(default_factory=dict)
    proficiencies: list[dict[str, str]] = Field(default_factory=list)
    class_features: list[str] = Field(default_factory=list)
    species_traits: list[str] = Field(default_factory=list)
    spellcasting_stats: dict[str, Any] | None = None
    spell_slots: dict[int, int] = Field(default_factory=dict)
    origin_feat: str = ""
    general_feats: list[str] = Field(default_factory=list)
    selected_masteries: list[str] = Field(default_factory=list)


class CharacterSaveRequest(BaseModel):
    state: CharacterCreationState
    inventory: list[InventoryItem] = Field(default_factory=list)
