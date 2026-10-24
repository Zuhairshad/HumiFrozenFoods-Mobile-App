import type { Testimonial } from '@/types';

const MEDIA = 'https://humisfrozenfoods.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2F';

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Sarah Ahmed',
    location: 'London, UK',
    quote:
      "The best frozen samosas I've ever had! Tastes just like homemade. My family loves them and they're so convenient for quick snacks.",
    rating: 5,
    avatar: `${MEDIA}avatar-icon-1.f9f30f39.png&w=128&q=75`,
  },
  {
    id: 't2',
    name: 'Mohammed Khan',
    location: 'Birmingham, UK',
    quote:
      'Amazing quality and authentic taste. The seekh kabobs are absolutely delicious. Will definitely be ordering again!',
    rating: 5,
    avatar: `${MEDIA}avatar-icon-2.76e53dd5.png&w=128&q=75`,
  },
  {
    id: 't3',
    name: 'Fatima Ali',
    location: 'Manchester, UK',
    quote:
      'Perfect for busy weeknights. Quick to prepare and tastes incredible. Highly recommend the spring rolls!',
    rating: 5,
    avatar: `${MEDIA}avatar-icon-3.6f0e373e.png&w=128&q=75`,
  },
];
