from pathlib import Path
import os
import json

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .rule_engine import calculate_stats, get_level_from_xp
from .schemas import CharacterCreationState, CharacterRecord, CharacterSaveRequest, DerivedStats


app = FastAPI(title="D&D 2024 Character Manager", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://crayfish-swooned-reformat.ngrok-free.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/rules/catalog")
def rules_catalog() -> dict[str, object]:
    rules_root = Path(os.getenv("RULES_ROOT", "/app/data/rules"))
    catalog = {}
    for category in ("classes", "backgrounds", "species", "spells"):
        catalog[category] = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in sorted((rules_root / category).glob("*.json"))
        ]
    creation_path = rules_root / "character-creation.json"
    catalog["character_creation"] = json.loads(creation_path.read_text(encoding="utf-8"))
    catalog["general_rules"] = json.loads((rules_root / "general-rules.json").read_text(encoding="utf-8"))
    catalog["gameplay_tips"] = json.loads((rules_root / "gameplay-tips.json").read_text(encoding="utf-8"))
    catalog["srd_sections"] = json.loads((rules_root / "srd-sections" / "index.json").read_text(encoding="utf-8"))
    for catalog_name in ("masteries", "feats", "weapons", "armor", "tools"):
        catalog[catalog_name] = json.loads((rules_root / f"{catalog_name}.json").read_text(encoding="utf-8"))
    catalog["subclasses"] = json.loads((rules_root / "subclasses.json").read_text(encoding="utf-8"))
    catalog["spellcasting"] = json.loads((rules_root / "spellcasting.json").read_text(encoding="utf-8"))
    catalog["starting_equipment"] = json.loads((rules_root / "starting-equipment.json").read_text(encoding="utf-8"))
    catalog["class_levels"] = json.loads((rules_root / "class-levels.json").read_text(encoding="utf-8"))
    return catalog


@app.post("/api/rules/calculate", response_model=DerivedStats)
def calculate(state: CharacterCreationState) -> DerivedStats:
    try:
        rules_root = Path(os.getenv("RULES_ROOT", "/app/data/rules"))
        return calculate_stats(state, rules_root)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def characters_root() -> Path:
    root = Path(os.getenv("CHARACTERS_ROOT", "/app/data/characters"))
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)
    return root


def character_path(character_id: str) -> Path:
    if not character_id or any(part in character_id for part in ("/", "\\", "..")):
        raise HTTPException(status_code=400, detail="Invalid character id")
    return characters_root() / f"{character_id}.json"


def read_character(path: Path) -> CharacterRecord:
    try:
        return CharacterRecord.model_validate_json(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Character not found") from error


def build_record(request: CharacterSaveRequest, character_id: str | None = None) -> CharacterRecord:
    try:
        rules_root = Path(os.getenv("RULES_ROOT", "/app/data/rules"))
        stats = calculate_stats(request.state, rules_root)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    level_from_xp = get_level_from_xp(request.xp)
    if request.state.level != level_from_xp:
        request.state.level = level_from_xp
    return CharacterRecord(
        id=character_id or uuid4().hex,
        name=request.state.details.name.strip(),
        species_id=request.state.species_id,
        class_id=request.state.class_id,
        background_id=request.state.background_id,
        level=request.state.level,
        xp=request.xp,
        session_xp=request.session_xp,
        session_note=request.session_note,
        last_session=request.last_session,
        base_ability_scores=request.state.base_scores,
        background_ability_boosts=request.state.background_boosts,
        final_ability_scores=stats.final_scores,
        max_hp=stats.max_hp,
        armor_class=stats.armor_class,
        proficiency_bonus=stats.proficiency_bonus,
        modifiers=stats.modifiers,
        initiative=stats.initiative,
        passive_perception=stats.passive_perception,
        inventory=request.inventory if request.inventory else stats.calculated_inventory,
        details=request.state.details,
        creation_state=request.state,
        updated_at=datetime.now(timezone.utc),
        saving_throws=stats.saving_throws,
        skill_bonuses=stats.skill_bonuses,
        proficiencies=stats.proficiencies,
        class_features=stats.class_features,
        species_traits=stats.species_traits,
        spellcasting_stats=stats.spellcasting_stats,
        spell_slots=stats.spell_slots,
        origin_feat=stats.origin_feat,
        general_feats=stats.general_feats,
        selected_masteries=stats.selected_masteries,
        subclass_id=request.state.subclass_id,
    )


@app.get("/api/characters", response_model=list[CharacterRecord])
def list_characters() -> list[CharacterRecord]:
    return [read_character(path) for path in sorted(characters_root().glob("*.json"))]


@app.get("/api/characters/{character_id}", response_model=CharacterRecord)
def get_character(character_id: str) -> CharacterRecord:
    return read_character(character_path(character_id))


@app.post("/api/characters", response_model=CharacterRecord, status_code=201)
def create_character(request: CharacterSaveRequest) -> CharacterRecord:
    if not request.state.details.name.strip():
        raise HTTPException(status_code=422, detail="Character name is required")
    record = build_record(request)
    character_path(record.id).write_text(record.model_dump_json(indent=2), encoding="utf-8")
    return record


@app.put("/api/characters/{character_id}", response_model=CharacterRecord)
def update_character(character_id: str, request: CharacterSaveRequest) -> CharacterRecord:
    path = character_path(character_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Character not found")
    if not request.state.details.name.strip():
        raise HTTPException(status_code=422, detail="Character name is required")
    record = build_record(request, character_id)
    path.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    return record


@app.delete("/api/characters/{character_id}", status_code=204)
def delete_character(character_id: str) -> None:
    path = character_path(character_id)
    try:
        path.unlink()
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Character not found") from error
