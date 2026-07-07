// pizzaImages.js
// Optional decorative pizza photos, mapped by menu NAME. These are presentation
// ONLY — items, prices and counts still come from public/data/*.txt (menuLoader).
// Any pizza without a mapped image falls back to the 🍕 tile, so a swapped menu
// still renders correctly. Files live in public/images/.

const IMAGES = {
  'Margherita': '/images/margherita.jpg',
  'Chicago Deep Dish': '/images/Chicago-deep-dish.jpg',
  'Greek Mediterranean': '/images/Greek-med.jpg',
  'California Veggie': '/images/California-veg.jpg',
  'Farm House': '/images/farm-house.jpg',
  'Pepperoni Classic': '/images/pepperoni.jpg',
  'BBQ Chicken': '/images/bbq.jpg',
  'Paneer Tikka': '/images/paneer-tikka.jpg',
}

/** Image path for a pizza by name, or null to use the emoji placeholder. */
export function pizzaImage(name) {
  return IMAGES[name] ?? null
}
