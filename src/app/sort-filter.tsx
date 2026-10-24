import { Stack } from 'expo-router';
import { SortFilterSheet } from '@/features/shop/SortFilterSheet';

/** Sort & Filter: native formSheet with two detents and a visible grabber (design 5.2). */
export default function SortFilterRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: [0.5, 0.85],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          sheetExpandsWhenScrolledToEdge: true,
        }}
      />
      <SortFilterSheet />
    </>
  );
}
