// 1. We use the modern "modular" imports (v9+)
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDyxtpA_FI8_gqUz2dHv1ceBFe7W1zHWpE",
  authDomain: "arched-lens-451511-d3.firebaseapp.com",
  projectId: "arched-lens-451511-d3",
  storageBucket: "arched-lens-451511-d3.firebasestorage.app",
  messagingSenderId: "314383384865",
  appId: "1:314383384865:web:c15993a40411a240273e60",
  measurementId: "G-Z1GJ2D8MY0",
  // 2. CRITICAL: Realtime Database needs this URL to connect!
  // I constructed this based on your projectId.
  databaseURL: "https://arched-lens-451511-d3-default-rtdb.europe-west1.firebasedatabase.app"
};

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);

// 4. Export the database instance so your app can use it
export const db = getDatabase(app);
