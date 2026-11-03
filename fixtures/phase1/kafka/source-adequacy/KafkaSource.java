package sourceproof;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.annotation.KafkaListener;

class KafkaSource {
    void send(ProducerFactory<String, String> factory, String value) {
        KafkaTemplate<String, String> template = new KafkaTemplate<>(factory);
        template.send("events", value);
    }
    @KafkaListener(topics = "events")
    void receive(String value) { }
}
