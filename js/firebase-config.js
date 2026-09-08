// Firebase project config for the Acqua bubble mini-game's shared leaderboard.
// These values are safe to expose publicly -- Firestore access is controlled
// by the security rules configured in the Firebase console, not by hiding this.
const firebaseConfig = {
  apiKey: "AIzaSyBD_JRtDt2mj68foheY-0cG1b2TyanPqKM",
  authDomain: "acqua-calda-game.firebaseapp.com",
  projectId: "acqua-calda-game",
  storageBucket: "acqua-calda-game.firebasestorage.app",
  messagingSenderId: "157079336745",
  appId: "1:157079336745:web:7b1a12cd72e0d12e5fa938"
};

firebase.initializeApp(firebaseConfig);
