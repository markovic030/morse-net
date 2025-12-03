
import firebase from "firebase/app";
import "firebase/database";

// --- INSTRUCTIONS ---
// 1. Go to your Firebase Console for 'renotrack-bor'
// 2. Go to Project Settings (Gear Icon) -> General
// 3. Scroll down to "Your apps". If there is no Web app, click the (</>) icon to create one.
// 4. Copy the 'firebaseConfig' object shown there and paste the values below.

const firebaseConfig = {
  apiKey: "AIzaSyDyxtpA_FI8_gqUz2dHv1ceBFe7W1zHWpE",
  authDomain: "arched-lens-451511-d3.firebaseapp.com",
  projectId: "arched-lens-451511-d3",
  storageBucket: "arched-lens-451511-d3.firebasestorage.app",
  messagingSenderId: "314383384865",
  appId: "1:314383384865:web:c15993a40411a240273e60",
  measurementId: "G-Z1GJ2D8MY0"
};

// Initialize Firebase (Singleton check)
const app = !firebase.apps.length 
  ? firebase.initializeApp(firebaseConfig) 
  : firebase.app();

export const db = app.database();
