import org.springframework.data.mongodb.core.MongoTemplate;
class Store {
    MongoTemplate template;
    MongoTemplate getTemplate() { return template; }
    void run() { MongoTemplate local = template; }
}
