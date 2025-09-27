const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://mak53797571:Jy3X0iE7mCuOkEma@cluster0.gccun0i.mongodb.net/Project0?retryWrites=true&w=majority';

async function testConnection() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log('Connected to MongoDB Atlas!');
        await client.db('Project0').command({ ping: 1 });
        console.log('Ping successful!');
    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        await client.close();
    }
}

testConnection();