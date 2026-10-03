import express from "express";
import { CartService } from "./cart/cart-service";
import { toCartView } from "./cart/cart-view";
import { categoryTree } from "./catalog/category-tree";
import { findProduct } from "./catalog/product-repository";
import { toProductCard } from "./catalog/product-view";
import { searchProducts } from "./catalog/search";
import { checkout, CheckoutError } from "./checkout/checkout-service";

const app = express();
const carts = new CartService();

app.use(express.json());

app.get("/categories", (_req, res) => {
  res.json(categoryTree());
});

app.get("/products", (req, res) => {
  const country = typeof req.query.country === "string" ? req.query.country : "DE";
  const products = searchProducts(typeof req.query.q === "string" ? req.query.q : "", {
    category: typeof req.query.category === "string" ? req.query.category : undefined,
    inStockOnly: req.query.inStock === "1",
  });
  res.json(products.map((product) => toProductCard(product, country)));
});

app.get("/products/:sku", (req, res) => {
  const product = findProduct(req.params.sku);
  if (product === undefined) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(toProductCard(product));
});

app.get("/cart/:session", (req, res) => {
  res.json(toCartView(carts.open(req.params.session)));
});

app.post("/cart/:session/items", (req, res) => {
  const { sku, quantity } = req.body as { sku: string; quantity?: number };
  res.json(toCartView(carts.add(req.params.session, sku, quantity)));
});

app.post("/checkout/:session", async (req, res, next) => {
  try {
    const cart = carts.open(req.params.session);
    const result = await checkout({ ...req.body, cart });
    carts.clear(cart.sessionId);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof CheckoutError) {
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.listen(Number(process.env.PORT ?? 3000));
