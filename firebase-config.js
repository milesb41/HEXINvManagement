// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyCDr4GChglEMeBgoEbuD1jEzoH6gdMEfTg",
  authDomain: "tracky-4bae3.firebaseapp.com",
  projectId: "tracky-4bae3",
  storageBucket: "tracky-4bae3.firebasestorage.app",
  messagingSenderId: "615239119707",
  appId: "1:615239119707:web:525b953c69b653840a607e",
  measurementId: "G-Y46L0PVR1V"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();