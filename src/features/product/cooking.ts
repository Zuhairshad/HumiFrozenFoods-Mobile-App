export interface CookingMethod {
  icon: 'flame-outline' | 'flash-outline' | 'water-outline';
  title: string;
  detail: string;
}

/** Generic frozen-snack guidance; always cooked from frozen, never thawed. */
export const cookingMethods: CookingMethod[] = [
  { icon: 'flame-outline', title: 'Oven', detail: 'Preheat to 200°C (180°C fan). Bake from frozen on a lined tray for 18–20 mins, turning halfway, until golden.' },
  { icon: 'flash-outline', title: 'Air fryer', detail: 'Preheat to 180°C. Cook from frozen in a single layer for 10–12 mins, shaking halfway, until crisp.' },
  { icon: 'water-outline', title: 'Deep fry', detail: 'Heat oil to 180°C. Fry from frozen for 4–5 mins until deep golden, then drain on kitchen paper.' },
];

export const cookingNote = 'Always cook from frozen. Make sure the product is piping hot throughout before serving. Do not refreeze once thawed.';
