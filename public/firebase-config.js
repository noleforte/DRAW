// Firebase configuration for client-side
const firebaseConfig = {
    apiKey: "AIzaSyBmeUZ3TpZ8bqRF4rpkBmVHO9PpYURCWM0",
    authDomain: "royalball-8cc64.firebaseapp.com",
    projectId: "royalball-8cc64",
    storageBucket: "royalball-8cc64.firebasestorage.app",
    messagingSenderId: "142883771111",
    appId: "1:142883771111:web:7c8525f4aa40d5ebb7c842",
    measurementId: "G-VZKYSJX7E9"
};

// Check if Firebase is loaded
if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded!');
    alert('Firebase not loaded. Please check your internet connection.');
} else {
    try {
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);

        // Initialize Firebase services
        const auth = firebase.auth();
        const db = firebase.firestore();

        // Initialize Analytics if available
        let analytics = null;
        try {
            analytics = firebase.analytics();
        } catch (e) {
        }

        // Export for use in other files
        window.firebaseAuth = auth;
        window.firebaseDb = db;
        window.firebaseAnalytics = analytics;
        window.firebaseReady = true;

        console.log('🔥 Firebase services ready:', {
            auth: !!auth,
            firestore: !!db,
            analytics: !!analytics
        });

    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        alert('Firebase initialization failed: ' + error.message);
    }
} 