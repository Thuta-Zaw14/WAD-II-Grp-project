

import Review from './Review';
import Session from './Session';
import db from './db';
import * as fb from 'firebase/firestore';
//import {doc, getDoc, deleteDoc, updateDoc, collection, setDoc, addDoc, getDocs, where} from 'firebase/firestore';
export async function DupeExist(collection, fieldName, value) {
        const q = fb.query(fb.collection(db, collection),fb.where(fieldName,'==',value),fb.limit(1));
        const userExist = await fb.getDocs(q);
        
        return !userExist.empty;
}
export async function getAllDocs(colName) {
    fb.getDocs(fb.collection(db, colName))
    .then((res) => {
        allDoc.forEach((a) => {console.log(a.data())}); 
    })
    .catch((err) => {
        console.log(error);
    })
  
    
}
    
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
    
export async function addUser(user) {
    try {
        
        if (await DupeExist('users','name',user.name)) {
                console.log(user.name + " already exists");
        }
        else {
            await fb.addDoc(fb.collection(db,'users'), {
                name: user.name,
                phoneNo: user.number
            })
        }
        // if (isUserExist) {
        //     console.log("user alr exist");
        //     console.log(isThere.data());
        //     return;
        // }
        // await fb.addDoc(fb.collection(db,'users'), {
        //     name: user.name,
        //     phoneNo: user.number
        // })
    } catch (error) {
        console.log(error);
    } finally {
        console.log("done");
    }
}