"""The product catalogue campaigns can advertise. Seeded into the ``products`` table at startup.

In a real deployment this would come from the seller's listings; here it is a
fixed, deterministic list so the "Add products" picker has something to offer.
Prices are integer cents; ``color`` is used for the swatch shown in place of an image.
"""

PRODUCT_CATEGORIES = ("Electronics", "Home & Kitchen", "Beauty", "Sports", "Toys", "Grocery", "Fashion", "Books")

# (id, name, category, price, color); sku == id
PRODUCTS: tuple[tuple[str, str, str, int, str], ...] = (
    ("SKU-1001", "Wireless Noise-Cancelling Headphones", "Electronics", 14999, "#4f46e5"),
    ("SKU-1002", "USB-C Fast Charger 65W", "Electronics", 3499, "#6366f1"),
    ("SKU-1003", "4K Streaming Media Player", "Electronics", 5999, "#818cf8"),
    ("SKU-1004", "Smart Fitness Watch", "Electronics", 19999, "#4338ca"),
    ("SKU-2001", "Stainless Steel Insulated Bottle 1L", "Home & Kitchen", 2499, "#f97316"),
    ("SKU-2002", "Non-stick Frying Pan 28cm", "Home & Kitchen", 3299, "#fb923c"),
    ("SKU-2003", "Espresso Machine Compact", "Home & Kitchen", 12900, "#ea580c"),
    ("SKU-2004", "Robot Vacuum Cleaner", "Home & Kitchen", 24900, "#c2410c"),
    ("SKU-3001", "Vitamin C Brightening Serum", "Beauty", 1899, "#ec4899"),
    ("SKU-3002", "Mineral Sunscreen SPF 50", "Beauty", 1599, "#f472b6"),
    ("SKU-3003", "Electric Toothbrush Pro", "Beauty", 6999, "#db2777"),
    ("SKU-4001", "Yoga Mat 6mm Non-slip", "Sports", 2999, "#0ea5e9"),
    ("SKU-4002", "Adjustable Dumbbell Set 20kg", "Sports", 8999, "#0284c7"),
    ("SKU-4003", "Trail Running Shoes", "Sports", 10999, "#38bdf8"),
    ("SKU-5001", "Building Blocks 500-piece Set", "Toys", 3999, "#16a34a"),
    ("SKU-5002", "Remote Control Off-road Car", "Toys", 4599, "#22c55e"),
    ("SKU-5003", "Wooden Puzzle Animals", "Toys", 1499, "#15803d"),
    ("SKU-6001", "Organic Coffee Beans 1kg", "Grocery", 1999, "#a16207"),
    ("SKU-6002", "Protein Bars Variety Pack (12)", "Grocery", 2399, "#ca8a04"),
    ("SKU-6003", "Extra Virgin Olive Oil 750ml", "Grocery", 1299, "#eab308"),
    ("SKU-7001", "Merino Wool Crew Sweater", "Fashion", 7999, "#7c3aed"),
    ("SKU-7002", "Slim Fit Stretch Jeans", "Fashion", 4999, "#8b5cf6"),
    ("SKU-7003", "Leather Crossbody Bag", "Fashion", 8900, "#6d28d9"),
    ("SKU-8001", "The Art of Focus (Hardcover)", "Books", 2299, "#64748b"),
    ("SKU-8002", "Cooking for Busy Weeknights", "Books", 1899, "#475569"),
    ("SKU-1005", "Bluetooth Speaker Waterproof", "Electronics", 4999, "#5b21b6"),
    ("SKU-1006", "Mechanical Keyboard TKL", "Electronics", 8999, "#3730a3"),
    ("SKU-1007", "Wireless Mouse Ergonomic", "Electronics", 2999, "#4c1d95"),
    ("SKU-2005", "Cast Iron Dutch Oven 5L", "Home & Kitchen", 7999, "#9a3412"),
    ("SKU-2006", "Air Purifier HEPA", "Home & Kitchen", 15900, "#b45309"),
    ("SKU-2007", "Bamboo Cutting Board Set", "Home & Kitchen", 2199, "#d97706"),
    ("SKU-3004", "Hyaluronic Acid Moisturiser", "Beauty", 2199, "#be185d"),
    ("SKU-3005", "Hair Dryer Ionic 2000W", "Beauty", 5499, "#9d174d"),
    ("SKU-4004", "Resistance Bands Set of 5", "Sports", 1699, "#0369a1"),
    ("SKU-4005", "Cycling Helmet Adult", "Sports", 5999, "#075985"),
    ("SKU-5004", "Board Game Family Night", "Toys", 2999, "#166534"),
    ("SKU-5005", "Plush Dinosaur 40cm", "Toys", 1999, "#14532d"),
    ("SKU-6004", "Green Tea Matcha Powder 100g", "Grocery", 1599, "#854d0e"),
    ("SKU-7004", "Running Socks 6-pack", "Fashion", 1799, "#5b21b6"),
    ("SKU-8003", "Atlas of Remote Islands", "Books", 2999, "#334155"),
)

PRODUCTS_BY_ID = {p[0]: p for p in PRODUCTS}


def snapshot(product_id: str) -> dict:
    """The stored form of a catalogue product (id, sku, name, category, price)."""
    p = PRODUCTS_BY_ID[product_id]
    return {"id": p[0], "sku": p[0], "name": p[1], "category": p[2], "price": p[3]}
