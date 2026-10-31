import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
    apiKey : "AIzaSyDpPJ5F89ReeyLEtil5zdGaJSkXJyxQoEk",
authDomain : "wadii-project-c1e14.firebaseapp.com",
projectId : "wadii-project-c1e14",
storageBucket : "wadii-project-c1e14.firebasestorage.app",
messagingSenderId : "58717159700",
appId : "1:58717159700:web:e1ce595200c460cd4bc201"


}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
