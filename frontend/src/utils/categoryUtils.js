/**
 * categoryUtils.js — Smart emoji resolver for retail POS product categories & items.
 */

export function getCategoryEmoji(categoryName, productName = '') {
  const cat = String(categoryName || '').toLowerCase().trim()
  const pName = String(productName || '').toLowerCase().trim()

  // 1. Smart product name overrides
  if (pName.includes('coffee')) return '☕'
  if (pName.includes('tea') || pName.includes('chai')) return '🍵'
  if (pName.includes('kulfi') || pName.includes('icecream') || pName.includes('ice cream') || pName.includes('cone') || pName.includes('chocobar') || pName.includes('cassatta') || pName.includes('sandwich')) return '🍦'
  if (pName.includes('biscuit') || pName.includes('cookie') || pName.includes('bourbon') || pName.includes('milkbikis') || pName.includes('50 50') || pName.includes('50×50')) return '🍪'
  if (pName.includes('snicker') || pName.includes('chocolate') || pName.includes('cadbury') || pName.includes('munch') || pName.includes('kitkat') || pName.includes('dairy milk')) return '🍫'

  // 2. Normalized category string (strips whitespace, dashes, underscores)
  const norm = cat.replace(/[\s_\-]/g, '')

  if (!norm || norm === 'all') return '🏪'

  if (norm.includes('cooldrink') || norm.includes('softdrink') || norm.includes('beverage') || norm.includes('drink') || norm.includes('juice') || norm.includes('soda') || norm.includes('cola') || norm.includes('pepsi') || norm.includes('sprite') || norm.includes('bovonto') || norm.includes('7up')) {
    return '🥤'
  }
  if (norm.includes('icecream') || norm.includes('kulfi') || norm.includes('dessert') || norm.includes('gelato')) {
    return '🍦'
  }
  if (norm.includes('snack') || norm.includes('chip') || norm.includes('namkeen') || norm.includes('biscuit') || norm.includes('cookie') || norm.includes('popcorn') || norm.includes('munch')) {
    return '🍿'
  }
  if (norm.includes('dairy') || norm.includes('milk') || norm.includes('curd') || norm.includes('butter') || norm.includes('paneer') || norm.includes('cheese') || norm.includes('lassi') || norm.includes('buttermilk')) {
    return '🥛'
  }
  if (norm.includes('bakery') || norm.includes('bread') || norm.includes('cake') || norm.includes('pastry') || norm.includes('bun') || norm.includes('toast')) {
    return '🍞'
  }
  if (norm.includes('chocolat') || norm.includes('candy') || norm.includes('sweet') || norm.includes('confectionery')) {
    return '🍫'
  }
  if (norm.includes('personal') || norm.includes('care') || norm.includes('soap') || norm.includes('shampoo') || norm.includes('beauty') || norm.includes('hygiene')) {
    return '🧴'
  }
  if (norm.includes('stationery') || norm.includes('book') || norm.includes('pen') || norm.includes('paper') || norm.includes('office')) {
    return '📝'
  }
  if (norm.includes('grocery') || norm.includes('provision') || norm.includes('staple') || norm.includes('grain') || norm.includes('rice') || norm.includes('atta') || norm.includes('oil')) {
    return '🧺'
  }
  if (norm.includes('tea') || norm.includes('coffee') || norm.includes('hotdrink')) {
    return '☕'
  }
  if (norm.includes('fruit') || norm.includes('vegetable') || norm.includes('produce')) {
    return '🍎'
  }

  return '📦'
}
