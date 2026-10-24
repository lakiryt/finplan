const yenFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export const yen = (n: number) => `${yenFormat.format(Math.round(n))}円`
export const man = (n: number) => `${(n / 10000).toFixed(1)}万`
