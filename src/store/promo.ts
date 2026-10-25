import { create } from 'zustand';

/**
 * The promo code the shopper typed. The client NEVER decides validity or amount: the code is sent
 * with every quote and the server's answer (`quote.promo`) decides whether it is applied.
 */
interface PromoState {
  code: string | null;
  /** Server message for the last rejected code (inline, under the field). */
  rejection: string | null;
  set: (code: string) => void;
  reject: (message: string) => void;
  clear: () => void;
}

export const usePromoStore = create<PromoState>()((set) => ({
  code: null,
  rejection: null,
  set: (code) => set({ code: code.trim(), rejection: null }),
  reject: (message) => set({ code: null, rejection: message }),
  clear: () => set({ code: null, rejection: null }),
}));
