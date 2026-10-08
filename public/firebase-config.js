export const firebaseConfig = {
  apiKey: "AIzaSyDw27s2-7G3DZ0smixCYPvdbTqgL_DSXiY",
  authDomain: "usf-sharia.firebaseapp.com",
  projectId: "usf-sharia",
  storageBucket: "usf-sharia.firebasestorage.app",
  messagingSenderId: "314297423711",
  appId: "1:314297423711:web:4e9bd5f2b90542595ac8ea",
  measurementId: "G-4K7VL1ZL08"
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);
