// netlify/functions/save-subscription.js
const admin = require('firebase-admin');
const webpush = require('web-push');

// Initialize Firebase Admin (Using your project config safely)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Replace newlines properly if copied into environment variables
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
        })
    });
}

const db = admin.firestore();

// Configure Web Push with your VAPID keys from Netlify Environment variables
webpush.setVapidDetails(
    'mailto:your-email@gmail.com', // Replace with your contact email
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

exports.handler = async (event, context) => {
    // Enable CORS so your frontend can communicate with it freely
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode-200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const subscription = JSON.parse(event.body);

        if (!subscription || !subscription.endpoint) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid subscription object' }) };
        }

        // Save the unique device subscription to a Firestore collection named 'push_subscriptions'
        // We use the endpoint as the document ID to prevent duplicate entries for the same browser
        const subRef = db.collection('push_subscriptions').doc(Buffer.from(subscription.endpoint).toString('base64'));
        await subRef.set({
            subscription: subscription,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Subscribed successfully!' })
        };

    } catch (error) {
        console.error('Error saving subscription:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};