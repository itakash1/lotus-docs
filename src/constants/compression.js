export const COMPRESSION_PRESETS = {
  gentle: { label: 'Бережно', minQuality: 0.65, maxQuality: 0.96, minSsim: 0.98 },
  balanced: { label: 'Баланс размера и качества', minQuality: 0.4, maxQuality: 0.92, minSsim: 0.94 },
  strong: { label: 'Меньше размер', minQuality: 0.25, maxQuality: 0.88, minSsim: 0.88 },
};
