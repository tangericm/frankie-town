import { FETCH_ITEMS } from "./bakery.gameplay";

export const QUEST = {
	butterIngredientId: "butter",
	flourIngredientId: "flour",
	eggsIngredientId: "eggs",
	sugarIngredientId: "sugar",
	bakeryItemIds: FETCH_ITEMS.map((item) => item.id),
};
