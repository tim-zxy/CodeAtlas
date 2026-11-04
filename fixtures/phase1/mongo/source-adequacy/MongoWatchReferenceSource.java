package sourceproof;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.MongoCollection;
import org.bson.Document;

class MongoWatchReferenceSource {
    void watch(MongoClient client) {
        MongoDatabase database = client.getDatabase("atlas");
        MongoCollection<Document> collection = database.getCollection("events");
        collection.watch().forEach(this::handle);
    }
    private void handle(Object change) { }
}
