import unittest
from pathlib import Path
from backend.schemas import Ability, AbilityScores, CharacterCreationState, Armor, AbilityMethod
from backend.rule_engine import calculate_stats


RULES_ROOT = Path("/app/data/rules") if Path("/app/data/rules").exists() else Path(__file__).resolve().parents[2] / "data" / "rules"


class TestRuleEngine(unittest.TestCase):
    def test_soldier_fighter_point_buy(self):
        state = CharacterCreationState(
            class_id="fighter",
            species_id="human",
            background_id="soldier",
            level=1,
            ability_method=AbilityMethod.point_buy,
            base_scores=AbilityScores(
                strength=15, dexterity=14, constitution=13,
                intelligence=12, wisdom=10, charisma=8,
            ),
            background_boosts={Ability.strength: 2, Ability.constitution: 1},
            selected_skills=["athletics", "acrobatics"],
            armor=Armor(base_ac=16, dexterity_cap=0, category="heavy"),
            shield=True,
        )
        stats = calculate_stats(state, RULES_ROOT)
        self.assertEqual(stats.final_scores.strength, 17)
        self.assertEqual(stats.final_scores.constitution, 14)
        self.assertEqual(stats.modifiers[Ability.strength], 3)
        self.assertEqual(stats.armor_class, 18)  # 16 Chain Mail + 2 Shield
        self.assertEqual(stats.max_hp, 12)  # 10 + 2 CON mod
        self.assertEqual(stats.proficiency_bonus, 2)
        self.assertTrue(len(stats.calculated_inventory) > 0)

    def test_invalid_background_boost_rejected(self):
        # Soldier allows strength, dexterity, constitution. Charisma is invalid!
        with self.assertRaises(ValueError):
            state = CharacterCreationState(
                class_id="fighter",
                species_id="human",
                background_id="soldier",
                level=1,
                ability_method=AbilityMethod.point_buy,
                base_scores=AbilityScores(
                    strength=15, dexterity=14, constitution=13,
                    intelligence=12, wisdom=10, charisma=8,
                ),
                background_boosts={Ability.charisma: 2, Ability.constitution: 1},
                selected_skills=["athletics", "acrobatics"],
            )
            calculate_stats(state, RULES_ROOT)

    def test_barbarian_unarmored_defense(self):
        state = CharacterCreationState(
            class_id="barbarian",
            species_id="dwarf",
            background_id="soldier",
            level=1,
            ability_method=AbilityMethod.point_buy,
            base_scores=AbilityScores(
                strength=15, dexterity=14, constitution=13,
                intelligence=12, wisdom=10, charisma=8,
            ),
            background_boosts={Ability.strength: 2, Ability.constitution: 1},
            selected_skills=["athletics", "perception"],
            armor=Armor(base_ac=10, dexterity_cap=None, category="unarmored"),
            shield=False,
            proficient_perception=True,
        )
        stats = calculate_stats(state, RULES_ROOT)
        # Unarmored AC = 10 + DEX mod(2) + CON mod(2) = 14
        self.assertEqual(stats.armor_class, 14)
        # Dwarf HP = 12 + CON mod(2) + 1 (dwarf) = 15
        self.assertEqual(stats.max_hp, 15)

    def test_wizard_spellcasting(self):
        state = CharacterCreationState(
            class_id="wizard",
            species_id="elf",
            background_id="sage",
            level=1,
            ability_method=AbilityMethod.point_buy,
            base_scores=AbilityScores(
                strength=8, dexterity=14, constitution=13,
                intelligence=15, wisdom=12, charisma=10,
            ),
            background_boosts={Ability.intelligence: 2, Ability.wisdom: 1},
            selected_skills=["arcana", "history"],
            selected_spells=["fire-bolt", "mage-hand", "magic-missile", "shield"],
        )
        stats = calculate_stats(state, RULES_ROOT)
        self.assertIsNotNone(stats.spellcasting_stats)
        self.assertEqual(stats.spellcasting_stats["save_dc"], 13)  # 8 + 2 prof + 3 INT
        self.assertEqual(stats.spellcasting_stats["attack_bonus"], 5)  # 2 prof + 3 INT
        self.assertEqual(stats.spell_slots, {1: 2})

    def test_monk_unarmored_defense_ignores_untrained_shield_and_uses_dex_wis(self):
        state = CharacterCreationState(
            class_id="monk",
            species_id="human",
            background_id="sage",
            level=1,
            ability_method=AbilityMethod.point_buy,
            base_scores=AbilityScores(
                strength=8, dexterity=15, constitution=13,
                intelligence=10, wisdom=14, charisma=12,
            ),
            background_boosts={Ability.wisdom: 2, Ability.charisma: 1},
            selected_skills=["acrobatics", "insight"],
            armor=Armor(base_ac=10, dexterity_cap=None, category="unarmored"),
            shield=True,
            selected_weapons=["club"],
        )
        stats = calculate_stats(state, RULES_ROOT)
        self.assertEqual(stats.armor_class, 12)  # 10 + Dex 2; shield bonus ignored and Monk feature is lost with shield
        self.assertEqual(stats.initiative, 2)  # Dexterity modifier only

    def test_monk_rejects_untrained_martial_weapon(self):
        state = CharacterCreationState(
            class_id="monk",
            species_id="human",
            background_id="sage",
            level=1,
            ability_method=AbilityMethod.point_buy,
            base_scores=AbilityScores(
                strength=8, dexterity=15, constitution=13,
                intelligence=10, wisdom=14, charisma=12,
            ),
            background_boosts={Ability.wisdom: 2, Ability.charisma: 1},
            selected_skills=["acrobatics", "insight"],
            armor=Armor(base_ac=10, dexterity_cap=None, category="unarmored"),
            selected_weapons=["greatsword"],
        )
        with self.assertRaises(ValueError):
            calculate_stats(state, RULES_ROOT)


if __name__ == "__main__":
    unittest.main()
