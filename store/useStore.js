import { create } from 'zustand';

export const useStore = create((set) => ({
  activeTab: 'marketplace',
  selectedCategory: 'All',
  weatherAdvisory: null,
  priceTrends: [],
  listings: [],
  orders: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAppData: (data) => set(data),
  clearAppData: () => set({ weatherAdvisory: null, priceTrends: [], listings: [], orders: [], activeTab: 'marketplace' })
}));
