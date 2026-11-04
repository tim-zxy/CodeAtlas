package sourceproof;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.MongoCollection;
import org.bson.Document;

class MongoWatchSource {
    void watch(MongoClient client) {
        MongoDatabase database = client.getDatabase("atlas");
        MongoCollection<Document> collection = database.getCollection("events");
        collection.watch().forEach(change -> handle(change));
    }
    private void handle(Object change) { }
}
