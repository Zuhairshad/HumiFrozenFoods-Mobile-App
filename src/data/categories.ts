import type { Category } from '@/types';

const MEDIA = 'https://humisfrozenfoods.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2F';

export const categories: Category[] = [
  {
    id: 'savory-snacks',
    title: 'Savory Snacks',
    image: `${MEDIA}collection-product-img-1.f1858097.png&w=640&q=75`,
    blurb: 'Spring rolls, tikkis and rotis for quick, crowd-pleasing bites.',
  },
  {
    id: 'kebabs',
    title: 'Kebabs',
    image: `${MEDIA}collection-product-img-2.88d770ec.png&w=640&q=75`,
    blurb: 'Seekh, shami and chapli kebabs, richly spiced and ready to fry.',
  },
  {
    id: 'vegetable-samosas',
    title: 'Vegetable Samosas',
    image: `${MEDIA}collection-product-img-3.1b71dd2c.jpeg&w=640&q=75`,
    blurb: 'Golden, flaky pastry filled with lightly spiced vegetables.',
  },
  {
    id: 'samosas',
    title: 'Samosas',
    image: `${MEDIA}collection-product-img-4.d272a346.jpeg&w=640&q=75`,
    blurb: 'Classic meat and chicken samosas, crisp outside and juicy within.',
  },
];
