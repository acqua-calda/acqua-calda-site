// Firebase project config, shared by:
// - the Acqua bubble mini-game's shared leaderboard (Firestore)
// - the ACQUA CHAT realtime avatar chat (Realtime Database + Anonymous Auth)
// These values are safe to expose publicly -- access is controlled by the
// security rules configured in the Firebase console, not by hiding this.
const firebaseConfig = {
  apiKey: "AIzaSyBD_JRtDt2mj68foheY-0cG1b2TyanPqKM",
  authDomain: "acqua-calda-game.firebaseapp.com",
  projectId: "acqua-calda-game",
  storageBucket: "acqua-calda-game.firebasestorage.app",
  messagingSenderId: "157079336745",
  appId: "1:157079336745:web:7b1a12cd72e0d12e5fa938",
  // TODO: Realtime Database をFirebaseコンソールで有効化した後、
  // 発行されるURL（https://<project>-default-rtdb.<region>.firebasedatabase.app）に置き換える。
  // 未設定のままだとチャットページは「準備中」表示になるだけで、他の機能には影響しない。
  databaseURL: "https://acqua-calda-game-default-rtdb.asia-southeast1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
