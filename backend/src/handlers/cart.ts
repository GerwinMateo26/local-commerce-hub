import { Router } from "express";
import platformAPIClient from "../services/platformAPIClient";

const router = Router();

// Define a shopping cart 
const cartKey = 'shoppingCart';

// Add to Cart 
router.post("/add-to-cart", async (req, res) => {
    const { productId, quantity } = req.body;
    // Get the current shopping cart from the session
    let shoppingCart = req.session[cartKey] || {};
    // Add the product to the cart or update quantity if already present
    shoppingCart[productId] = (shoppingCart[productId] || 0) + quantity;
    // Update the session with the modified shopping cart
    req.session[cartKey] = shoppingCart;
    return res.status(200).json({ message: "Product added to cart" });
});

// Checkout 
router.post("/checkout", async (req, res) => {
    const app = req.app;
    const orderCollection = app.locals.orderCollection;
    const inventoryCollection = app.locals.inventoryCollection;
    const shoppingCart = req.session[cartKey];
    const paymentId = req.body.paymentId;
    const currentPayment = await platformAPIClient.get(
      `/v2/payments/${paymentId}`
    );
    

    try {
        // Iterate through the items in the shopping cart
        for (const productId in shoppingCart) {
            const quantity = shoppingCart[productId];
            // Retrieve the product from the inventory
            const product = await inventoryCollection.findOne({ product_id: productId });
            if (!product || product.quantity < quantity) {
                throw new Error(`Insufficient inventory for product ${productId}`);
            }
            // Add the item to the order list
            await orderCollection.insertOne({
                pi_payment_id: paymentId,
                product_id: currentPayment.data.metadata.productId,
                user: req.session.currentUser.uid,
                txid: null,
                paid: false,
                cancelled: false,
                created_at: new Date(),
                // Add additional order details as needed
            });
            // Update inventory
            await inventoryCollection.updateOne(
                { product_id: productId },
                { $inc: { quantity: -quantity } } // Decrement inventory by the ordered quantity
            );
        }
        // Clear the shopping cart after successful checkout
        req.session[cartKey] = {};
        
        // Initiate the payment process 
        const paymentResponse = await platformAPIClient.post("/v2/payments/initiate", {
            items: shoppingCart, // Send the items to the payment system for processing
            // Add other necessary payment details
        });
        
        return res.status(200).json({ message: "Checkout successful", paymentResponse });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
