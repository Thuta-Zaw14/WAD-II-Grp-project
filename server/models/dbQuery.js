import db from './db';
import * as fb from 'firebase/firestore';

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
export async function findDocWhereEquals(col, field, value) {
    fb.getDoc(fb.query(fb.collection(db,col),fb.where(field,'==',value)))
    .then(res => {
        return {status: true, docs: res}
    })
    .catch(err => {
        console.log("findDocsWhereEquals failed");
        return {status: false, error: err }
    })
}
export async function findDocsWhereEquals(col, field, value) {
    fb.getDocs(fb.query(fb.collection(db,col),fb.where(field,'==',value)))
    .then(res => {
        return {status: true, docs: res}
    })
    .catch(err => {
        console.log("findDocsWhereEquals failed");
        return {status: false, error: err }
    })
}

export async function addDoc(col, doc) {
    fb.addDoc(fb.collection(db,col), doc)
    .then(res => {
        return {status: true, id: res.id}
    })
    .catch(err => {
        return {status: false, error: err }
    })
}

export async function addDocID(col, doc, id) {
    fb.setDoc(fb.doc(db,col,id),doc)
    .then(res => {
        return {status: true, id: res.id}
    })
    .catch(err => {
        return {status: false, error: err }
    })
}

// export async function deleteDocR(col, field, value) {
//     await admin.firestore().recursiveDelete(findDocWhereEquals(col,field,value)["docs"].id);   
// }