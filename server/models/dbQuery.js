import { db } from '../config/firebaseAdmin.js'

// Firestore gives us a "snapshot"; this turns it into a plain object that includes its id
function toObject(doc) {
  return { id: doc.id, ...doc.data() }
}

// true if some document in the collection already has field == value
export async function DupeExist(collection, fieldName, value) {
  const snapshot = await db.collection(collection).where(fieldName, '==', value).limit(1).get()
  return !snapshot.empty
}

// every document in a collection, as an array
export async function getAllDocs(colName) {
  const snapshot = await db.collection(colName).get()
  const list = []
  for (const doc of snapshot.docs) {
    list.push(toObject(doc))
  }
  return list
}

// all documents where field == value  ->  { status: true, docs: [...] }
export async function findDocsWhereEquals(col, field, value) {
  try {
    const snapshot = await db.collection(col).where(field, '==', value).get()
    const docs = []
    for (const doc of snapshot.docs) {
      docs.push(toObject(doc))
    }
    return { status: true, docs: docs }
  } catch (err) {
    console.log('findDocsWhereEquals failed:', err.message)
    return { status: false, error: err }
  }
}

// the first document where field == value  ->  { status: true, doc: {...} or null }
export async function findDocWhereEquals(col, field, value) {
  const result = await findDocsWhereEquals(col, field, value)
  if (!result.status) {
    return result
  }
  return { status: true, doc: result.docs[0] || null }
}

// add a document with an automatic id  ->  { status: true, id }
export async function addDoc(col, doc) {
  try {
    const ref = await db.collection(col).add(doc)
    return { status: true, id: ref.id }
  } catch (err) {
    console.log('addDoc failed:', err.message)
    return { status: false, error: err }
  }
}

// add (or replace) a document with an id we choose, e.g. the user's uid  ->  { status: true, id }
export async function addDocID(col, doc, id) {
  try {
    await db.collection(col).doc(id).set(doc)
    return { status: true, id: id }
  } catch (err) {
    console.log('addDocID failed:', err.message)
    return { status: false, error: err }
  }
}

// delete a document AND everything in its sub-collections (e.g. a chat and its messages)
// A normal .delete() would leave the sub-collections behind.
export async function deleteDocR(col, id) {
  try {
    await db.recursiveDelete(db.collection(col).doc(id))
    return { status: true }
  } catch (err) {
    console.log('deleteDocR failed:', err.message)
    return { status: false, error: err }
  }
}