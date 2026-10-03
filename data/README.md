# Data

- `restaurant-menu.json`: the real menu of Tandoori Pizza, San Jose (menu text only). This is the recipe book.
- `shelf-life.json`: USDA FoodKeeper refrigerated shelf life per ingredient (with `"proxy"` where FoodKeeper has no entry).
- `unit-costs.json`: simulated wholesale cost per kg, for the food-cost check.

## Optional: Maven Analytics sales patterns

Put the four Maven Analytics "Pizza Place Sales" CSVs here to use real day-by-day sales:

- orders.csv
- order_details.csv
- pizzas.csv
- pizza_types.csv

Download: mavenanalytics.io/data-playground (search "Pizza Place Sales") or Kaggle.
They are used only for sales patterns (which categories sell on which weekday and hour), not for recipes.
Without them the app uses the dataset's published totals, so the demo never breaks.
