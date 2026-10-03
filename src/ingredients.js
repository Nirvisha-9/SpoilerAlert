// Ingredient "characters" for the shelf. Swap these for Novita/ZooWork-generated stickers later.
const MAP = [
  [/shrimp/i, '🦐'], [/chicken/i, '🍗'], [/spinach|arugula|lettuce|greens/i, '🥬'], [/cilantro|basil|herb|thyme|oregano|mint/i, '🌿'],
  [/paneer/i, '🧀'], [/lamb/i, '🍖'], [/dough|bread|crouton/i, '🫓'], [/cauliflower/i, '🥦'], [/ginger/i, '🫚'],
  [/strawberr/i, '🍓'], [/carrot/i, '🥕'], [/walnut/i, '🌰'], [/cranberr|pomegranate/i, '🍒'], [/butter/i, '🧈'],
  [/mushroom/i, '🍄'], [/pepperoni|salami|ham\b|sausage|chorizo|prosciutto|beef|meat|capocollo|soppressata|pancetta|calabrese|nduja/i, '🍖'], [/jalape|chil/i, '🌶️'], [/pepper/i, '🫑'], [/tomato/i, '🍅'], [/onion/i, '🧅'],
  [/garlic/i, '🧄'], [/olive/i, '🫒'], [/corn/i, '🌽'], [/pineapple/i, '🍍'], [/pear/i, '🍐'], [/eggplant/i, '🍆'],
  [/potato/i, '🥔'], [/bacon/i, '🥓'],
  [/cheese|mozzarella|feta|gouda|brie|ricotta|parmigiano|asiago|fontina|provolone|romano|gorgonzola/i, '🧀'],
  [/sauce|pesto|alfredo/i, '🥫'], [/artichoke/i, '🌱'], [/avocado/i, '🥑'],
];
export const glyph = (name) => MAP.find(([re]) => re.test(name))?.[1] || '🫙';
