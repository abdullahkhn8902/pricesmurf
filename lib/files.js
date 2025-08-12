export async function updateFile(id, updateData) {
    const client = await getMongoClient();
    const db = client.db('Project0');
    const filesCollection = db.collection('excelFiles.files');

    const result = await filesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
    );

    return result;
}