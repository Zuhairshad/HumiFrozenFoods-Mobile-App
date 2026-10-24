import type { HeroSlide } from '@/types';

const MEDIA = 'https://humisfrozenfoods.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2F';

export const heroSlides: HeroSlide[] = [
  {
    id: 'hero-meat-spring-rolls',
    eyebrow: 'Best Seller',
    title: 'Meat Spring Rolls',
    subtitle:
      'Perfectly seasoned minced meat wrapped in our signature crispy pastry. A traditional recipe crafted for modern taste buds.',
    image: `${MEDIA}home-banner-img-1.72885fe6.png&w=1080&q=75`,
    productId: 'meat-spring-rolls',
    badges: ['Premium', 'Halal Certified', 'Ready in 8 Mins', 'Made in United Kingdom'],
  },
  {
    id: 'hero-chicken-samosa',
    eyebrow: 'Popular Choice',
    title: 'Chicken Samosa',
    subtitle:
      'Crispy chicken samosas made with fresh ingredients and traditional spices. A perfect snack for all.',
    image: `${MEDIA}home-banner-img-3.91fa2d77.png&w=1080&q=75`,
    productId: 'chicken-samosa-large',
    badges: ['Authentic', 'Halal Certified', 'Ready in 5 Mins', 'Made in United Kingdom'],
  },
  {
    id: 'hero-chapli-kebabs',
    eyebrow: 'Family Favorite',
    title: 'Chapli Kebabs',
    subtitle:
      'Juicy chapli kebabs marinated in a blend of spices and grilled to perfection. Ideal for gatherings and BBQs.',
    image: `${MEDIA}home-banner-img-4.4e2d01ef.png&w=1080&q=75`,
    productId: 'meat-peshawari-chapli-kebab',
    badges: ['Halal Certified', 'Ready in 12 Mins', 'Made in United Kingdom'],
  },
  {
    id: 'hero-aloo-tikki',
    eyebrow: "Chef's Special",
    title: 'Aloo Tikki',
    subtitle:
      'Spiced potato patties, crispy on the outside and soft on the inside. A delightful snack loved by all ages.',
    image: `${MEDIA}home-banner-img-5.39610caf.png&w=1080&q=75`,
    productId: 'aloo-tikki',
    badges: ['Omega-3 Rich', 'Ready in 7 Mins', 'Made in United Kingdom'],
  },
];
