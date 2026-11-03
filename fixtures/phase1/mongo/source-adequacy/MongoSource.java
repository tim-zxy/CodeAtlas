package sourceproof;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import com.mongodb.client.MongoCollection;
import org.bson.Document;

class MongoSource {
    private MongoTemplate template;
    void read(Query query) { template.findOne(query, Document.class, "events"); }
    void write(Document value) { template.save(value, "events"); }
    void watch(MongoCollection<Document> collection) {
        collection.watch().forEach(change -> handle(change));
    }
    void handle(Object change) { }
}
