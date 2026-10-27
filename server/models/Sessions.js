
import Review from './Review';
import Session from './Session';
import db from './db';
import {doc, getDoc, deleteDoc, updateDoc, collection, setDoc, addDoc} from 'firebase/firestore';

//const {doc, getDoc, deleteDoc, updateDoc, collection, setDoc} = require('firebase/firestore');
async function getSessions() {
    try {
        let sesh = new Session(
        "lalala",
        new Date().toDateString(),
        "lolol",
        [new Date().toDateString(),new Date().toDateString(),new Date().toDateString()],
        "pooping town",
        "waduh",
        50,
        new Review("loaa","dan"));
        await addDoc(collection(db,'sessions'), {sesh});
            console.log("passed")
        } catch (e) {   
            console.log(e)
        }
        
    }
    
export { getSessions };
    
