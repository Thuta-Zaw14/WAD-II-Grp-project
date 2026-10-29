

import Review from './Review';
import Session from './Session';
import db from './db';
import * as fb from 'firebase/firestore';
import * as dbQuery from  './dbQuery';
//import {doc, getDoc, deleteDoc, updateDoc, collection, setDoc, addDoc, getDocs, where} from 'firebase/firestore';
 
export async function getUsersOfSession(sessionId) {
    try {
        console.log("fuck");
        const res = await fb.getDoc(fb.doc(db,'sessions',sessionId));
        const resArr = res.get('participants');
        console.log(resArr);
        
    } catch (err) {
        console.log(err);
    }
}

export async function addUserToSession(sessionId, userName) {
    const seshRef = fb.doc(db,'sessions',sessionId);
    await fb.updateDoc(seshRef, {
        participants: fb.arrayUnion(userName)
    });

}
export async function removeUserFromSession(sessionId, userName) {
    const seshRef = fb.doc(db,'sessions',sessionId);
    await fb.updateDoc(seshRef, {
        participants: fb.arrayRemove(userName)
    });
    
}
export async function addUser(user) {
   const res = await dbQuery.addDoc('users',user);
}

