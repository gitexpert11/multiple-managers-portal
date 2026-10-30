/**
 * The product catalogue campaigns can advertise. In a real deployment this
 * would come from the seller's listings; here it is a fixed, deterministic
 * list so the "Add products" picker has something to offer.
 *
 * Prices are integer cents. `color` is used for the swatch shown in place of
 * a product image.
 */
export const PRODUCT_CATEGORIES = ['Electronics', 'Home & Kitchen', 'Beauty', 'Sports', 'Toys', 'Grocery', 'Fashion', 'Books'];

export const PRODUCTS = [
  { id: 'SKU-1001', sku: 'SKU-1001', name: 'Wireless Noise-Cancelling Headphones', category: 'Electronics', price: 14999, color: '#4f46e5' },
  { id: 'SKU-1002', sku: 'SKU-1002', name: 'USB-C Fast Charger 65W', category: 'Electronics', price: 3499, color: '#6366f1' },
  { id: 'SKU-1003', sku: 'SKU-1003', name: '4K Streaming Media Player', category: 'Electronics', price: 5999, color: '#818cf8' },
  { id: 'SKU-1004', sku: 'SKU-1004', name: 'Smart Fitness Watch', category: 'Electronics', price: 19999, color: '#4338ca' },
  { id: 'SKU-2001', sku: 'SKU-2001', name: 'Stainless Steel Insulated Bottle 1L', category: 'Home & Kitchen', price: 2499, color: '#f97316' },
  { id: 'SKU-2002', sku: 'SKU-2002', name: 'Non-stick Frying Pan 28cm', category: 'Home & Kitchen', price: 3299, color: '#fb923c' },
  { id: 'SKU-2003', sku: 'SKU-2003', name: 'Espresso Machine Compact', category: 'Home & Kitchen', price: 12900, color: '#ea580c' },
  { id: 'SKU-2004', sku: 'SKU-2004', name: 'Robot Vacuum Cleaner', category: 'Home & Kitchen', price: 24900, color: '#c2410c' },
  { id: 'SKU-3001', sku: 'SKU-3001', name: 'Vitamin C Brightening Serum', category: 'Beauty', price: 1899, color: '#ec4899' },
  { id: 'SKU-3002', sku: 'SKU-3002', name: 'Mineral Sunscreen SPF 50', category: 'Beauty', price: 1599, color: '#f472b6' },
  { id: 'SKU-3003', sku: 'SKU-3003', name: 'Electric Toothbrush Pro', category: 'Beauty', price: 6999, color: '#db2777' },
  { id: 'SKU-4001', sku: 'SKU-4001', name: 'Yoga Mat 6mm Non-slip', category: 'Sports', price: 2999, color: '#0ea5e9' },
  { id: 'SKU-4002', sku: 'SKU-4002', name: 'Adjustable Dumbbell Set 20kg', category: 'Sports', price: 8999, color: '#0284c7' },
  { id: 'SKU-4003', sku: 'SKU-4003', name: 'Trail Running Shoes', category: 'Sports', price: 10999, color: '#38bdf8' },
  { id: 'SKU-5001', sku: 'SKU-5001', name: 'Building Blocks 500-piece Set', category: 'Toys', price: 3999, color: '#16a34a' },
  { id: 'SKU-5002', sku: 'SKU-5002', name: 'Remote Control Off-road Car', category: 'Toys', price: 4599, color: '#22c55e' },
  { id: 'SKU-5003', sku: 'SKU-5003', name: 'Wooden Puzzle Animals', category: 'Toys', price: 1499, color: '#15803d' },
  { id: 'SKU-6001', sku: 'SKU-6001', name: 'Organic Coffee Beans 1kg', category: 'Grocery', price: 1999, color: '#a16207' },
  { id: 'SKU-6002', sku: 'SKU-6002', name: 'Protein Bars Variety Pack (12)', category: 'Grocery', price: 2399, color: '#ca8a04' },
  { id: 'SKU-6003', sku: 'SKU-6003', name: 'Extra Virgin Olive Oil 750ml', category: 'Grocery', price: 1299, color: '#eab308' },
  { id: 'SKU-7001', sku: 'SKU-7001', name: 'Merino Wool Crew Sweater', category: 'Fashion', price: 7999, color: '#7c3aed' },
  { id: 'SKU-7002', sku: 'SKU-7002', name: 'Slim Fit Stretch Jeans', category: 'Fashion', price: 4999, color: '#8b5cf6' },
  { id: 'SKU-7003', sku: 'SKU-7003', name: 'Leather Crossbody Bag', category: 'Fashion', price: 8900, color: '#6d28d9' },
  { id: 'SKU-8001', sku: 'SKU-8001', name: 'The Art of Focus (Hardcover)', category: 'Books', price: 2299, color: '#64748b' },
  { id: 'SKU-8002', sku: 'SKU-8002', name: 'Cooking for Busy Weeknights', category: 'Books', price: 1899, color: '#475569' },
  { id: 'SKU-1005', sku: 'SKU-1005', name: 'Bluetooth Speaker Waterproof', category: 'Electronics', price: 4999, color: '#5b21b6' },
  { id: 'SKU-1006', sku: 'SKU-1006', name: 'Mechanical Keyboard TKL', category: 'Electronics', price: 8999, color: '#3730a3' },
  { id: 'SKU-1007', sku: 'SKU-1007', name: 'Wireless Mouse Ergonomic', category: 'Electronics', price: 2999, color: '#4c1d95' },
  { id: 'SKU-2005', sku: 'SKU-2005', name: 'Cast Iron Dutch Oven 5L', category: 'Home & Kitchen', price: 7999, color: '#9a3412' },
  { id: 'SKU-2006', sku: 'SKU-2006', name: 'Air Purifier HEPA', category: 'Home & Kitchen', price: 15900, color: '#b45309' },
  { id: 'SKU-2007', sku: 'SKU-2007', name: 'Bamboo Cutting Board Set', category: 'Home & Kitchen', price: 2199, color: '#d97706' },
  { id: 'SKU-3004', sku: 'SKU-3004', name: 'Hyaluronic Acid Moisturiser', category: 'Beauty', price: 2199, color: '#be185d' },
  { id: 'SKU-3005', sku: 'SKU-3005', name: 'Hair Dryer Ionic 2000W', category: 'Beauty', price: 5499, color: '#9d174d' },
  { id: 'SKU-4004', sku: 'SKU-4004', name: 'Resistance Bands Set of 5', category: 'Sports', price: 1699, color: '#0369a1' },
  { id: 'SKU-4005', sku: 'SKU-4005', name: 'Cycling Helmet Adult', category: 'Sports', price: 5999, color: '#075985' },
  { id: 'SKU-5004', sku: 'SKU-5004', name: 'Board Game Family Night', category: 'Toys', price: 2999, color: '#166534' },
  { id: 'SKU-5005', sku: 'SKU-5005', name: 'Plush Dinosaur 40cm', category: 'Toys', price: 1999, color: '#14532d' },
  { id: 'SKU-6004', sku: 'SKU-6004', name: 'Green Tea Matcha Powder 100g', category: 'Grocery', price: 1599, color: '#854d0e' },
  { id: 'SKU-7004', sku: 'SKU-7004', name: 'Running Socks 6-pack', category: 'Fashion', price: 1799, color: '#5b21b6' },
  { id: 'SKU-8003', sku: 'SKU-8003', name: 'Atlas of Remote Islands', category: 'Books', price: 2999, color: '#334155' },
];

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id) {
  return BY_ID.get(id) || null;
}

/** Case-insensitive search over name, SKU and category. */
export function searchProducts(query, { category = null } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return PRODUCTS.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });
}
