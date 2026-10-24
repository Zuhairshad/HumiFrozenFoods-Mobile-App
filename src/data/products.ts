import type { Product } from '@/types';

const IMG = 'https://api.humisfrozenfoods.com/uploads/images/';

export const products: Product[] = [
  {
    id: 'punjabi-samosa-roti',
    name: 'Punjabi Samosa Roti',
    price: 5.98,
    category: 'savory-snacks',
    image: `${IMG}c3db8b40-2fa5-4efc-bb01-96f269bcd892.png`,
    description:
      "Flaky, layered roti with a Punjabi-style spiced samosa filling. Crisp on the outside, soft and savoury within.",
    tags: ['Halal Certified'],
    readyInMins: 6,
    weight: "10 pcs \u00b7 500g",
    rating: 4.5,
    reviewCount: 64,
    ingredients:
      "Wheat flour, potato, peas, onion, vegetable oil, cumin, coriander, green chilli, salt.",
  },
  {
    id: 'chicken-shami-kebab',
    name: 'Chicken Shami Kebab',
    price: 9.5,
    category: 'kebabs',
    image: `${IMG}9221f13a-74e7-43b1-9bb9-03ebb001320a.jpeg`,
    description:
      "Tender chicken and chana dal gently spiced and shaped into melt-in-the-mouth patties. Lovely with chutney.",
    tags: ['Halal Certified'],
    readyInMins: 10,
    weight: "12 pcs \u00b7 600g",
    rating: 4.7,
    reviewCount: 92,
    ingredients:
      "Halal chicken, chana dal, onion, ginger, garlic, green chilli, coriander, garam masala, salt.",
  },
  {
    id: 'vegetable-spring-rolls',
    name: 'Vegetable Spring Rolls',
    price: 7.2,
    category: 'savory-snacks',
    image: `${IMG}d1463fd2-48d6-4375-a5ac-03dfafbaf699.jpeg`,
    description:
      "Crunchy golden rolls packed with seasoned cabbage, carrot and spring onion. A dependable favourite for sharing.",
    tags: ['Vegan Friendly'],
    readyInMins: 8,
    weight: "20 pcs \u00b7 700g",
    rating: 4.5,
    reviewCount: 78,
    ingredients:
      "Wheat flour, cabbage, carrot, spring onion, vegetable oil, soy sauce, black pepper, salt.",
  },
  {
    id: 'meat-peshawari-chapli-kebab',
    name: 'Meat Peshawari Chapli Kebab',
    price: 12.5,
    category: 'kebabs',
    image: `${IMG}78ed3ffe-c031-4be3-af0c-097821966f02.jpeg`,
    description:
      "Bold, juicy Peshawari-style chapli kebabs made with minced meat, crushed coriander and pomegranate seed. Made for gatherings and BBQs.",
    tags: ['Halal Certified', 'Premium'],
    readyInMins: 12,
    weight: "6 pcs \u00b7 600g",
    rating: 4.8,
    reviewCount: 110,
    ingredients:
      "Halal minced beef, tomato, onion, coriander seed, pomegranate seed, green chilli, gram flour, spices, salt.",
  },
  {
    id: 'vegetable-crispy-samosa',
    name: 'Vegetable Crispy Samosa',
    price: 7.3,
    category: 'vegetable-samosas',
    image: `${IMG}4f569141-7a8c-449d-b156-ca79449c8878.jpeg`,
    description:
      "Crisp, golden pastry parcels filled with gently spiced potato, peas and carrot.",
    tags: ['Vegan Friendly'],
    readyInMins: 7,
    weight: "20 pcs \u00b7 700g",
    rating: 4.6,
    reviewCount: 85,
    ingredients:
      "Wheat flour, potato, peas, carrot, vegetable oil, cumin, coriander, green chilli, salt.",
  },
  {
    id: 'chicken-crispy-samosa',
    name: 'Chicken Crispy Samosa',
    price: 7.0,
    category: 'samosas',
    image: `${IMG}f3677da0-dd13-477b-bcd7-1bf306cb291f.jpeg`,
    description:
      "Bite-sized crispy samosas filled with seasoned halal chicken and fresh herbs.",
    tags: ['Halal Certified'],
    readyInMins: 7,
    weight: "20 pcs \u00b7 700g",
    rating: 4.6,
    reviewCount: 97,
    ingredients:
      "Wheat flour, halal chicken, onion, coriander, green chilli, vegetable oil, black pepper, salt.",
  },
  {
    id: 'meat-samosa-large',
    name: 'Meat Samosa Large',
    price: 7.8,
    category: 'samosas',
    image: `${IMG}1cabc34d-8fae-468c-abdd-9fadde35e818.jpeg`,
    description:
      "Generously filled, large samosas with spiced minced meat in a crisp, golden shell.",
    tags: ['Halal Certified'],
    readyInMins: 8,
    weight: "10 pcs \u00b7 800g",
    rating: 4.7,
    reviewCount: 101,
    ingredients:
      "Wheat flour, halal minced beef, onion, ginger, garlic, green chilli, coriander, vegetable oil, spices, salt.",
  },
  {
    id: 'meat-spring-rolls',
    name: 'Meat Spring Rolls',
    price: 7.0,
    category: 'savory-snacks',
    image: `${IMG}89645b60-468c-4e44-ba8a-ed236bc32c07.jpeg`,
    description:
      "Perfectly seasoned minced meat wrapped in our signature crispy pastry. A traditional recipe crafted for modern taste buds.",
    tags: ['Best Seller', 'Premium', 'Halal Certified'],
    readyInMins: 8,
    weight: "20 pcs \u00b7 700g",
    rating: 4.9,
    reviewCount: 164,
    ingredients:
      "Wheat flour, halal minced beef, cabbage, onion, spring onion, vegetable oil, black pepper, spices, salt.",
  },
  {
    id: 'chicken-seekh-kebab',
    name: 'Chicken Seekh Kebab',
    price: 13.5,
    category: 'kebabs',
    image: `${IMG}839fe4de-c8c2-4045-a22d-9eaede782019.jpeg`,
    description:
      "Succulent minced chicken kebabs seasoned with ginger, garlic and warm spices. Fry, grill or bake.",
    tags: ['Halal Certified', 'Premium'],
    readyInMins: 10,
    weight: "12 pcs \u00b7 720g",
    rating: 4.8,
    reviewCount: 128,
    ingredients:
      "Halal chicken, onion, ginger, garlic, green chilli, coriander, garam masala, cumin, salt.",
  },
  {
    id: 'chicken-peshawari-chapli-kebab',
    name: 'Chicken Peshawari Chapli Kebab',
    price: 14.0,
    category: 'kebabs',
    image: `${IMG}7259b85c-a466-4e95-bffa-ad2debc98ee4.jpeg`,
    description:
      "A lighter take on the Peshawari classic, made with spiced minced chicken, tomato and crushed coriander seed.",
    tags: ['Halal Certified', 'Premium'],
    readyInMins: 12,
    weight: "6 pcs \u00b7 600g",
    rating: 4.8,
    reviewCount: 87,
    ingredients:
      "Halal chicken, tomato, onion, coriander seed, pomegranate seed, green chilli, gram flour, spices, salt.",
  },
  {
    id: 'meat-crispy-samosa',
    name: 'Meat Crispy Samosa',
    price: 7.0,
    category: 'samosas',
    image: `${IMG}7173738d-3349-4964-9e44-2e350ad82f0f.jpeg`,
    description:
      "Crispy party-size samosas filled with richly spiced minced meat.",
    tags: ['Halal Certified'],
    readyInMins: 7,
    weight: "20 pcs \u00b7 700g",
    rating: 4.6,
    reviewCount: 93,
    ingredients:
      "Wheat flour, halal minced beef, onion, coriander, green chilli, vegetable oil, spices, salt.",
  },
  {
    id: 'chicken-samosa-large',
    name: 'Chicken Samosa Large',
    price: 7.5,
    category: 'samosas',
    image: `${IMG}fc57c202-5843-4477-9324-206d625a39ae.jpeg`,
    description:
      "Crispy chicken samosas made with fresh ingredients and traditional spices. A perfect snack for all.",
    tags: ['Halal Certified', 'Best Seller'],
    readyInMins: 8,
    weight: "10 pcs \u00b7 800g",
    rating: 4.8,
    reviewCount: 142,
    ingredients:
      "Wheat flour, halal chicken, onion, ginger, garlic, green chilli, coriander, vegetable oil, spices, salt.",
  },
  {
    id: 'tandoori-chicken-samosa-large',
    name: 'Tandoori Chicken Samosa Large',
    price: 9.2,
    category: 'samosas',
    image: `${IMG}4bb00552-f21b-4946-aae7-28b6fe80b0d0.jpeg`,
    description:
      "Large samosas filled with smoky tandoori-marinated chicken, yoghurt and aromatic spices.",
    tags: ['Halal Certified', 'Premium'],
    readyInMins: 8,
    weight: "10 pcs \u00b7 800g",
    rating: 4.7,
    reviewCount: 76,
    ingredients:
      "Wheat flour, halal chicken, yoghurt, tandoori spice blend, onion, coriander, vegetable oil, lemon juice, salt.",
  },
  {
    id: 'chicken-spring-rolls',
    name: 'Chicken Spring Rolls',
    price: 7.0,
    category: 'savory-snacks',
    image: `${IMG}8e2ade62-4006-4729-9779-ab17a1d638c8.jpeg`,
    description:
      "Crisp spring rolls filled with tender seasoned chicken and fresh vegetables.",
    tags: ['Halal Certified'],
    readyInMins: 8,
    weight: "20 pcs \u00b7 700g",
    rating: 4.6,
    reviewCount: 88,
    ingredients:
      "Wheat flour, halal chicken, cabbage, carrot, spring onion, vegetable oil, soy sauce, black pepper, salt.",
  },
  {
    id: 'vegetable-samosa-large',
    name: 'Vegetable Samosa Large',
    price: 7.7,
    category: 'vegetable-samosas',
    image: `${IMG}d3d59f07-a524-4da7-9e6c-1eda101ac604.jpeg`,
    description:
      "Large, golden samosas filled with spiced potato, peas and carrot. A meat-free classic.",
    tags: ['Vegan Friendly'],
    readyInMins: 8,
    weight: "10 pcs \u00b7 800g",
    rating: 4.6,
    reviewCount: 81,
    ingredients:
      "Wheat flour, potato, peas, carrot, onion, vegetable oil, cumin, coriander, green chilli, salt.",
  },
  {
    id: 'aloo-tikki',
    name: 'Aloo Tikki',
    price: 7.3,
    category: 'savory-snacks',
    image: `${IMG}ae68f745-2c29-40e9-8d78-b6ea39a21b7b.jpeg`,
    description:
      "Spiced potato patties, crispy on the outside and soft on the inside. A delightful snack loved by all ages.",
    tags: ['Omega-3 Rich', 'Vegan Friendly'],
    readyInMins: 7,
    weight: "12 pcs \u00b7 720g",
    rating: 4.7,
    reviewCount: 119,
    ingredients:
      "Potato, breadcrumbs, peas, onion, rapeseed oil, coriander, green chilli, cumin, salt.",
  },
  {
    id: 'meat-shami-kebab',
    name: 'Meat Shami Kebab',
    price: 9.2,
    category: 'kebabs',
    image: `${IMG}501240e9-e3ae-4b4b-9a89-9a751c09e9e7.jpeg`,
    description:
      "Classic shami kebabs made with minced meat and chana dal, softly spiced and delicately rich.",
    tags: ['Halal Certified'],
    readyInMins: 10,
    weight: "12 pcs \u00b7 600g",
    rating: 4.7,
    reviewCount: 90,
    ingredients:
      "Halal minced beef, chana dal, onion, ginger, garlic, green chilli, coriander, garam masala, salt.",
  },
];
